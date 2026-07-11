<template>
  <div>
    <div class="import-text-layout">
      <div class="import_code">
        <textarea
          spellcheck="false"
          v-model="importCode"
          placeholder="otpauth://totp/...
otpauth://totp/...
otpauth://hotp/...
..."
        ></textarea>
      </div>
      <div class="import-actions-stack">
        <div class="import-actions-row">
          <div class="import_encrypted">
            <input
              type="checkbox"
              id="encryptedCode"
              v-model="importEncrypted"
            />
            <label for="encryptedCode">{{ i18n.encrypted }}</label>
          </div>
          <a-button @click="importBackupCode()">
            {{ i18n.import_backup_code }}
          </a-button>
        </div>
        <a-text-input
          :label="i18n.phrase"
          v-model="importPassphrase"
          type="password"
          v-show="importEncrypted"
        />
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
      @cancel="cancelImport"
    />
  </div>
</template>
<script lang="ts">
import { Encryption } from "../../models/encryption";
import {
  applyDecryptedBackup,
  decryptParsedBackup,
} from "../../models/import-service";
import { parseBackupContentOffThread } from "../../models/import-worker-client";
import ImportFeedbackMixin from "./import-feedback";

export default ImportFeedbackMixin.extend({
  data: function () {
    return {
      importCode: "",
      importEncrypted: false,
      importPassphrase: "",
    };
  },
  methods: {
    getImportSummary(args: {
      failedCount: number;
      succeededCount: number;
      importedEntryCount: number;
      importedGroupCount: number;
      groupedEntryCount: number;
      normalizedGroupReferenceCount: number;
    }) {
      const lines = [
        `${this.i18n.ui_imported_entries}: ${args.importedEntryCount}`,
        `${this.i18n.ui_imported_groups}: ${args.importedGroupCount}`,
        `${this.i18n.ui_grouped_entries}: ${args.groupedEntryCount}`,
      ];

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
    async importBackupCode() {
      if (this.importInProgress) {
        return;
      }
      const signal = this.startImport(this.i18n.ui_importing_backup);
      this.setProgress(10, this.i18n.ui_progress_parsing_backup_text);

      try {
        const parsedBackup = await parseBackupContentOffThread(
          this.importCode,
          {
            signal,
            onProgress: (value) =>
              this.setProgress(
                10 + value * 0.22,
                this.i18n.ui_progress_parsing_backup_text
              ),
          }
        );
        this.setProgress(
          32,
          parsedBackup.source === "otpauth"
            ? this.i18n.ui_progress_parsing_otpauth
            : this.i18n.ui_progress_organizing_records
        );
        const passphrase: string | null =
          this.importEncrypted && this.importPassphrase
            ? this.importPassphrase
            : null;
        this.setProgress(
          52,
          passphrase
            ? this.i18n.ui_progress_decrypting
            : this.i18n.ui_progress_preparing_import
        );
        const decryptedBackup = await decryptParsedBackup(
          parsedBackup,
          passphrase,
          signal
        );
        const failedCount = parsedBackup.failedCount;
        const succeededCount = parsedBackup.succeededCount;
        this.lockImportCancellation();
        const result = await applyDecryptedBackup(decryptedBackup, {
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
        });

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
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
        return;
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
        return;
      } finally {
        this.finishImport(signal);
      }
    },
  },
});
</script>
