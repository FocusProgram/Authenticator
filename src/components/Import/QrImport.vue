<template>
  <div>
    <p style="margin: 10px 20px 20px 20px">
      {{ i18n.import_backup_qr_in_batches }}
    </p>
    <a-file-input
      button-type="file"
      accept="image/*"
      @change="importQr($event, true)"
      multiple="true"
      :label="i18n.import_backup_qr"
    />
    <ImportFeedbackPanel
      :show-progress="showProgress"
      :in-progress="importInProgress"
      :progress-value="importProgressValue"
      :progress-label="importProgressLabel"
      :progress-title="importProgressTitle"
      :summary-title="importSummaryTitle"
      :summary-message="importSummaryMessage"
      :summary-tone="importSummaryTone"
      :show-cancel="importInProgress && importCanCancel"
      @cancel="cancelImport"
    />
  </div>
</template>
<script lang="ts">
import { Encryption } from "../../models/encryption";
import { getEntryDataFromOTPAuthPerLine } from "../../models/import-otpauth";
import { applyDecryptedBackup } from "../../models/import-service";
import {
  assertQrFileBatchSize,
  getOtpUrlFromQrFile,
  MAX_QR_FILE_SIZE_BYTES,
} from "../../models/qr-import";
import ImportFeedbackMixin from "./import-feedback";

export default ImportFeedbackMixin.extend({
  methods: {
    getImportSummary(args: {
      failedCount: number;
      scannedCount: number;
      decodedCount: number;
      imageFailedCount: number;
      importedEntryCount: number;
    }) {
      const lines = [
        `${this.i18n.ui_scanned_images}: ${args.scannedCount}`,
        `${this.i18n.ui_decoded_images}: ${args.decodedCount}`,
        `${this.i18n.ui_imported_entries}: ${args.importedEntryCount}`,
      ];

      if (args.imageFailedCount > 0) {
        lines.push(`${this.i18n.ui_decode_failures}: ${args.imageFailedCount}`);
      }

      if (args.failedCount > 0) {
        lines.push(`${this.i18n.ui_failed_entries}: ${args.failedCount}`);
      }

      return lines.join("\n");
    },
    async importQr(event: Event, closeWindow: boolean) {
      if (this.importInProgress) {
        return;
      }
      this.resetImportFeedback();

      const target = event.target as HTMLInputElement;
      const files = Array.from(target?.files || []);
      if (!files.length) {
        this.importSummaryTitle = this.i18n.ui_import_failed;
        this.importSummaryTone = "error";
        this.importSummaryMessage = this.i18n.ui_no_image;
        this.setProgress(100, this.i18n.ui_no_image);
        return;
      }
      const signal = this.startImport(this.i18n.ui_importing_qr);
      this.setProgress(8, this.i18n.ui_progress_waiting_qr);

      try {
        assertQrFileBatchSize(files.length);

        const otpUrlList: string[] = [];
        let imageFailedCount = 0;
        const scannedCount = files.length;

        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
          if (signal.aborted) {
            throw new Error("importCancelled");
          }
          const file = files[fileIndex];
          this.setProgress(
            12 + ((fileIndex + 1) / scannedCount) * 48,
            `${this.i18n.ui_progress_scanning_qr} (${
              fileIndex + 1
            }/${scannedCount})`
          );

          if (file.size > MAX_QR_FILE_SIZE_BYTES) {
            imageFailedCount++;
            continue;
          }

          try {
            const otpUrl = await getOtpUrlFromQrFile(file, signal);
            if (otpUrl) {
              otpUrlList.push(otpUrl);
            } else {
              imageFailedCount++;
            }
          } catch (error) {
            if (signal.aborted) {
              throw error;
            }
            console.error("Failed to decode QR image:", file.name, error);
            imageFailedCount++;
          }
        }

        this.setProgress(66, this.i18n.ui_progress_parsing_otp);
        const result = await getEntryDataFromOTPAuthPerLine(
          otpUrlList.join("\n")
        );
        const { failedCount } = result;
        if (!Object.keys(result.exportData).length) {
          this.importSummaryTitle = this.i18n.ui_import_failed;
          this.importSummaryTone = "error";
          this.importSummaryMessage = this.getImportSummary({
            failedCount,
            scannedCount,
            decodedCount: otpUrlList.length,
            imageFailedCount,
            importedEntryCount: 0,
          });
          this.setProgress(100, this.i18n.ui_no_importable_content);
          return;
        }
        this.lockImportCancellation();
        const appliedResult = await applyDecryptedBackup(
          { entries: result.exportData, groups: {} },
          {
            encryption: this.$encryption as Encryption,
            onProgress: (value, key) =>
              this.setProgress(value, this.i18n[key] || key),
            refresh: this.$store
              ? async () => {
                  await this.$store.dispatch("groups/refreshGroups");
                  await this.$store.dispatch("accounts/updateEntries");
                }
              : undefined,
            signal,
          }
        );

        this.importSummaryTitle =
          failedCount === 0 && imageFailedCount === 0
            ? this.i18n.ui_import_complete
            : appliedResult.importedEntryCount > 0
            ? this.i18n.ui_import_partial
            : this.i18n.ui_import_failed;
        this.importSummaryTone =
          failedCount === 0 && imageFailedCount === 0
            ? "success"
            : appliedResult.importedEntryCount > 0
            ? "warning"
            : "error";
        this.importSummaryMessage = this.getImportSummary({
          failedCount,
          scannedCount,
          decodedCount: otpUrlList.length,
          imageFailedCount,
          importedEntryCount: appliedResult.importedEntryCount,
        });
        this.setProgress(100, this.i18n.ui_import_complete);

        if (closeWindow) {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          });
        }
      } catch (error) {
        if (this.isImportCancellation(error)) {
          if (!this.importSummaryMessage) {
            this.cancelImport();
          }
          return;
        }
        console.error(error);
        this.importSummaryTitle = this.i18n.ui_import_failed;
        this.importSummaryTone = "error";
        this.importSummaryMessage = await this.getImportErrorMessage(
          error,
          this.i18n.errorqr || "No importable QR code was found."
        );
        this.setProgress(100, this.i18n.ui_import_error);
      } finally {
        target.value = "";
        this.finishImport(signal);
      }
    },
  },
});
</script>
