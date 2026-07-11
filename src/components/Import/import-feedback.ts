import Vue from "vue";
import { StorageLocation, UserSettings } from "../../models/settings";
import ImportFeedbackPanel from "./ImportFeedbackPanel.vue";

export default Vue.extend({
  components: {
    ImportFeedbackPanel,
  },
  data() {
    return {
      importSummaryTitle: "",
      importSummaryMessage: "",
      importSummaryTone: "",
      showProgress: false,
      importInProgress: false,
      importProgressValue: 0,
      importProgressLabel: "",
      importProgressTitle: this.i18n.ui_importing_backup,
      importAbortController: null as AbortController | null,
      importCanCancel: false,
    };
  },
  beforeDestroy() {
    this.importAbortController?.abort();
  },
  methods: {
    resetImportFeedback() {
      this.importSummaryTitle = "";
      this.importSummaryMessage = "";
      this.importSummaryTone = "";
      this.showProgress = false;
      this.importInProgress = false;
      this.importProgressValue = 0;
      this.importProgressLabel = "";
    },
    startImport(title: string) {
      this.importAbortController?.abort();
      this.resetImportFeedback();
      this.importProgressTitle = title;
      this.importAbortController = new AbortController();
      this.importCanCancel = true;
      return this.importAbortController.signal;
    },
    finishImport(signal?: AbortSignal) {
      if (!signal || this.importAbortController?.signal === signal) {
        this.importAbortController = null;
        this.importCanCancel = false;
      }
    },
    lockImportCancellation() {
      this.importCanCancel = false;
    },
    cancelImport() {
      this.importAbortController?.abort();
      this.importAbortController = null;
      this.importCanCancel = false;
      this.importSummaryTitle = this.i18n.ui_import_cancelled;
      this.importSummaryTone = "warning";
      this.importSummaryMessage = this.i18n.ui_no_data_changed;
      this.setProgress(100, this.i18n.ui_import_cancelled);
    },
    isImportCancellation(error: unknown) {
      return (
        this.importAbortController?.signal.aborted === true ||
        (error instanceof Error &&
          (error.message === "importCancelled" ||
            error.message === "cancelled" ||
            error.name === "AbortError"))
      );
    },
    setProgress(value: number, label: string) {
      this.showProgress = true;
      this.importInProgress = value < 100;
      this.importProgressValue = Math.max(0, Math.min(100, Math.round(value)));
      this.importProgressLabel = label;
    },
    async getImportErrorMessage(error: unknown, fallback?: string) {
      await UserSettings.updateItems();
      const isSyncStorage =
        UserSettings.items.storageLocation === StorageLocation.Sync;
      const rawMessage =
        error instanceof Error ? error.message : String(error || "");

      if (rawMessage === "passphraseRequired") {
        return this.i18n.ui_error_passphrase_required;
      }

      if (rawMessage === "incorrectPassphrase") {
        return this.i18n.ui_error_incorrect_passphrase;
      }

      if (rawMessage === "invalidBackupFormat") {
        return this.i18n.ui_error_invalid_backup;
      }

      if (rawMessage === "noImportableEntries") {
        return this.i18n.ui_error_no_entries;
      }

      const fileErrorMessages: Record<string, string> = {
        readBackupFailed: this.i18n.ui_error_read_backup,
        readBackupAborted: this.i18n.ui_error_backup_aborted,
        backupContentTooLarge: this.i18n.ui_error_backup_too_large,
        backupParseTimeout: this.i18n.ui_error_backup_parse_timeout,
        backupWorkerFailed: this.i18n.ui_error_backup_worker,
        tooManyQrFiles: this.i18n.ui_error_too_many_qr_files,
        qrDecodeTimeout: this.i18n.ui_error_qr_timeout,
        readQrFailed: this.i18n.ui_error_read_qr,
        readQrAborted: this.i18n.ui_error_qr_aborted,
        loadQrFailed: this.i18n.ui_error_load_qr,
        importSystemKeyConflict: this.i18n.ui_error_system_key_conflict,
        importUnknownRecord: this.i18n.ui_error_unknown_record,
        importTypeConflict: this.i18n.ui_error_type_conflict,
        importIncompleteWrite: this.i18n.ui_error_incomplete_write,
        importBatchIdConflict: this.i18n.ui_error_batch_id_conflict,
        invalidImportGroupId: this.i18n.ui_error_invalid_group_id,
      };
      if (fileErrorMessages[rawMessage]) {
        return fileErrorMessages[rawMessage];
      }

      if (/QUOTA|MAX_ITEMS|MAX_WRITE|bytes/i.test(rawMessage)) {
        if (isSyncStorage) {
          return this.i18n.ui_error_sync_quota;
        }

        return this.i18n.ui_error_local_quota;
      }

      if (rawMessage && rawMessage !== "[object Object]") {
        return `${this.i18n.ui_reason}: ${rawMessage}`;
      }

      return fallback || this.i18n.ui_import_failed;
    },
  },
});
