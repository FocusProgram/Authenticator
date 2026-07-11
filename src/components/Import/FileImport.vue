<template>
  <div>
    <div v-if="!getFilePassphrase">
      <a-file-input
        button-type="file"
        accept=".json,.txt,application/json,text/plain"
        @change="importFile($event, true)"
        :label="i18n.import_backup_file"
      />
      <div class="import-inline-option">
        <input
          type="checkbox"
          id="clearBeforeImport"
          v-model="clearBeforeImport"
        />
        <label for="clearBeforeImport">{{ i18n.ui_clear_before_import }}</label>
      </div>
    </div>
    <div class="import_file_passphrase" v-else>
      <p class="error_password">{{ i18n.passphrase_info }}</p>
      <a-text-input
        :label="i18n.phrase"
        type="password"
        @enter="submitFilePassphrase"
        v-model="importFilePassphrase"
      />
      <div class="import-passphrase-actions">
        <a-button @click="cancelFilePassphrase()">{{ i18n.cancel }}</a-button>
        <a-button @click="submitFilePassphrase">{{ i18n.ok }}</a-button>
      </div>
    </div>
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
      @cancel="cancelCurrentImport"
    />
  </div>
</template>
<script lang="ts">
import { Encryption } from "../../models/encryption";
import { MAX_BACKUP_CONTENT_BYTES } from "../../models/import-limits";
import {
  applyDecryptedBackup,
  decryptParsedBackup,
} from "../../models/import-service";
import { parseBackupBufferOffThread } from "../../models/import-worker-client";
import ImportFeedbackMixin from "./import-feedback";

export default ImportFeedbackMixin.extend({
  data: function () {
    return {
      getFilePassphrase: false,
      importFilePassphrase: "",
      filePassphraseResolver: null as
        | ((passphrase: string | null) => void)
        | null,
      clearBeforeImport: false,
    };
  },
  beforeDestroy() {
    this.cancelFilePassphrase(false);
    this.importAbortController?.abort();
  },
  methods: {
    getImportSummary(args: {
      failedCount: number;
      succeededCount: number;
      importedEntryCount: number;
      importedGroupCount: number;
      groupedEntryCount: number;
      normalizedGroupReferenceCount: number;
      clearedEntryCount?: number;
      clearedGroupCount?: number;
    }) {
      const lines = [
        `${this.i18n.ui_imported_entries}: ${args.importedEntryCount}`,
        `${this.i18n.ui_imported_groups}: ${args.importedGroupCount}`,
        `${this.i18n.ui_grouped_entries}: ${args.groupedEntryCount}`,
      ];

      if (
        typeof args.clearedEntryCount === "number" ||
        typeof args.clearedGroupCount === "number"
      ) {
        lines.push(
          `${this.i18n.ui_cleared_otp}: ${args.clearedEntryCount || 0}`,
          `${this.i18n.ui_cleared_groups}: ${args.clearedGroupCount || 0}`
        );
      }

      if (args.failedCount > 0) {
        lines.push(`${this.i18n.ui_failed_entries}: ${args.failedCount}`);
      }

      if (args.normalizedGroupReferenceCount > 0) {
        lines.push(
          `${this.i18n.ui_removed_group_links}: ${args.normalizedGroupReferenceCount}`
        );
      }

      return lines.join("\n");
    },
    async importFile(event: Event, closeWindow: boolean) {
      if (this.importInProgress) {
        return;
      }
      this.resetImportFeedback();

      const target = event.target as HTMLInputElement;
      const file = target?.files?.[0];
      if (!file) {
        this.importSummaryTitle = this.i18n.ui_import_failed;
        this.importSummaryTone = "error";
        this.importSummaryMessage = this.i18n.ui_no_file;
        this.setProgress(100, this.i18n.ui_no_file);
        return;
      }
      const signal = this.startImport(this.i18n.ui_importing_backup);

      try {
        if (file.size > MAX_BACKUP_CONTENT_BYTES) {
          throw new Error("backupContentTooLarge");
        }

        this.setProgress(4, this.i18n.ui_progress_file_selected);
        const contentBuffer = await readBackupFile(
          file,
          (progressEvent: ProgressEvent<FileReader>) => {
            if (progressEvent.lengthComputable) {
              const ratio =
                progressEvent.total > 0
                  ? progressEvent.loaded / progressEvent.total
                  : 0;
              this.setProgress(
                10 + ratio * 24,
                this.i18n.ui_progress_reading_file
              );
            }
          },
          signal
        );
        this.setProgress(38, this.i18n.ui_progress_parsing_backup);
        const parsedBackup = await parseBackupBufferOffThread(contentBuffer, {
          signal,
          onProgress: (value) =>
            this.setProgress(
              38 + value * 0.12,
              this.i18n.ui_progress_parsing_backup
            ),
        });
        this.setProgress(
          46,
          parsedBackup.source === "bitwarden"
            ? this.i18n.ui_progress_parsing_bitwarden
            : parsedBackup.source === "otpauth"
            ? this.i18n.ui_progress_parsing_text
            : this.i18n.ui_progress_organizing_records
        );

        const passphrase = parsedBackup.requiresPassphrase
          ? await this.getOldPassphrase()
          : null;
        if (parsedBackup.requiresPassphrase && passphrase === null) {
          this.importSummaryTitle = this.i18n.ui_import_cancelled;
          this.importSummaryTone = "warning";
          this.importSummaryMessage = this.i18n.ui_no_data_changed;
          this.setProgress(100, this.i18n.ui_import_cancelled);
          return;
        }
        if (passphrase) {
          this.setProgress(58, this.i18n.ui_progress_decrypting);
        }

        const decryptedBackup = await decryptParsedBackup(
          parsedBackup,
          passphrase,
          signal
        );
        this.lockImportCancellation();
        const result = await applyDecryptedBackup(decryptedBackup, {
          encryption: this.$encryption as Encryption,
          clearFirst: this.clearBeforeImport,
          onProgress: (value, key) =>
            this.setProgress(value, this.i18n[key] || key),
          refresh: this.$store
            ? async () => {
                await this.$store.dispatch("groups/refreshGroups");
                await this.$store.dispatch("accounts/updateEntries");
              }
            : undefined,
          signal,
        });

        const { failedCount, succeededCount } = parsedBackup;
        this.importSummaryTitle =
          failedCount === 0
            ? this.i18n.ui_import_complete
            : succeededCount > 0
            ? this.i18n.ui_import_partial
            : this.i18n.ui_import_failed;
        this.importSummaryTone =
          failedCount === 0
            ? "success"
            : succeededCount > 0
            ? "warning"
            : "error";
        this.importSummaryMessage = this.getImportSummary({
          failedCount,
          succeededCount,
          ...result,
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
        this.importSummaryMessage = await this.getImportErrorMessage(error);
        this.setProgress(100, this.i18n.ui_import_error);
      } finally {
        target.value = "";
        this.getFilePassphrase = false;
        this.importFilePassphrase = "";
        this.filePassphraseResolver = null;
        this.finishImport(signal);
      }
    },
    async getOldPassphrase() {
      this.getFilePassphrase = true;
      this.setProgress(58, this.i18n.ui_progress_waiting_password);
      return new Promise<string | null>((resolve) => {
        this.filePassphraseResolver = resolve;
      });
    },
    submitFilePassphrase() {
      const passphrase = this.importFilePassphrase;
      if (!passphrase || !this.filePassphraseResolver) {
        return;
      }

      this.filePassphraseResolver(passphrase);
      this.filePassphraseResolver = null;
      this.getFilePassphrase = false;
    },
    cancelFilePassphrase(updateFeedback = true) {
      if (this.filePassphraseResolver) {
        this.filePassphraseResolver(null);
        this.filePassphraseResolver = null;
      }
      this.getFilePassphrase = false;
      this.importFilePassphrase = "";
      if (updateFeedback && this.importInProgress) {
        this.cancelImport();
      }
    },
    cancelCurrentImport() {
      this.cancelFilePassphrase(false);
      this.cancelImport();
    },
  },
});

function readBackupFile(
  file: File,
  onProgress: (event: ProgressEvent<FileReader>) => void,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener("abort", handleAbort);
    const handleAbort = () => reader.abort();
    reader.onload = () => {
      cleanup();
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("readBackupFailed"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error("readBackupFailed"));
    };
    reader.onabort = () => {
      cleanup();
      reject(
        new Error(signal?.aborted ? "importCancelled" : "readBackupAborted")
      );
    };
    reader.onprogress = onProgress;
    signal?.addEventListener("abort", handleAbort, { once: true });
    reader.readAsArrayBuffer(file);
  });
}
</script>
