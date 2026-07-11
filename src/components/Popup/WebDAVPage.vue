<template>
  <div class="subpage webdav-page">
    <div class="subpage-head" v-if="!embedded">
      <div class="subpage-title">{{ i18n.ui_webdav_title }}</div>
      <div class="subpage-subtitle">
        {{ i18n.ui_webdav_subtitle }}
      </div>
    </div>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_server_connection }}</div>
      </div>
      <div class="subpage-card subpage-form-card">
        <div class="webdav-connection-meta">
          {{ i18n.ui_webdav_connection_info }}
        </div>

        <label class="subpage-field">
          <span class="subpage-field-label">
            {{ i18n.webdav_server_url || "Server URL" }}
          </span>
          <input
            class="subpage-text-input"
            type="url"
            v-model="webdav.serverUrl"
            placeholder="https://example.com/webdav"
            autocomplete="url"
          />
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">
            {{ i18n.webdav_username || "Username" }}
          </span>
          <input
            class="subpage-text-input"
            type="text"
            v-model="webdav.username"
            autocomplete="username"
          />
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">
            {{ i18n.webdav_password || "Password" }}
          </span>
          <input
            class="subpage-text-input"
            type="password"
            v-model="webdav.password"
            autocomplete="current-password"
          />
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">{{ i18n.ui_backup_storage }}</span>
          <select class="subpage-select" v-model="webdav.encrypted">
            <option value="true">
              {{
                i18n.webdav_backup_option_encrypted ||
                "Encrypted storage (recommended)"
              }}
            </option>
            <option value="false">
              {{ i18n.webdav_backup_option_plain || "Plain-text storage" }}
            </option>
          </select>
        </label>

        <div class="subpage-actions">
          <button
            type="button"
            class="subpage-button"
            :disabled="webdav.isTesting"
            @click="testWebDAV"
          >
            {{
              webdav.isTesting
                ? i18n.ui_testing
                : i18n.webdav_test_connection || "Test connection"
            }}
          </button>
          <button
            type="button"
            class="subpage-button primary"
            :disabled="webdav.isSaving"
            @click="saveWebDAVSettings"
          >
            {{ webdav.isSaving ? i18n.ui_saving : i18n.webdav_save || "Save" }}
          </button>
        </div>
      </div>
    </section>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_automatic_backup }}</div>
        <span class="subpage-section-meta">
          {{ i18n.webdav_last_backup || "Last backup" }}: {{ lastBackupLabel }}
        </span>
      </div>
      <div class="subpage-list-card">
        <label class="subpage-row">
          <span class="subpage-row-icon"><IconSync /></span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">
              {{ i18n.webdav_auto_backup || "Automatic WebDAV backup" }}
            </span>
            <span class="subpage-row-desc">
              {{
                i18n.webdav_auto_backup_desc ||
                "Upload a backup every 7 days when Authenticator opens."
              }}
            </span>
          </span>
          <span class="subpage-switch">
            <input
              type="checkbox"
              v-model="webdav.autoBackup"
              @change="updateAutoBackupPreference"
            />
            <span class="subpage-switch-track"></span>
          </span>
        </label>

        <label class="subpage-row">
          <span class="subpage-row-icon neutral"><IconDatabase /></span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">{{ i18n.ui_retention_count }}</span>
            <span class="subpage-row-desc">{{ i18n.ui_retention_desc }}</span>
          </span>
          <span class="subpage-control">
            <input
              class="subpage-number-input"
              type="number"
              v-model.number="webdav.maxBackups"
              min="0"
              :aria-label="i18n.ui_retention_count"
              @change="updateMaxBackupsPreference"
            />
            <span class="subpage-control-unit">{{ i18n.ui_copies }}</span>
          </span>
        </label>
      </div>

      <div class="subpage-card webdav-action-card">
        <div class="subpage-actions">
          <button
            type="button"
            class="subpage-button primary"
            :disabled="webdav.isBackingUp"
            @click="backupToWebDAV"
          >
            {{
              webdav.isBackingUp
                ? i18n.ui_backing_up
                : i18n.webdav_backup_button || "Back up now"
            }}
          </button>
          <button
            type="button"
            class="subpage-button"
            :disabled="webdav.isLoadingList"
            @click="refreshWebDAVList"
          >
            {{
              webdav.isLoadingList
                ? i18n.ui_refreshing
                : i18n.webdav_refresh_list || "Refresh"
            }}
          </button>
        </div>
        <p class="subpage-card-message" v-if="webdav.message">
          {{ webdav.message }}
        </p>
      </div>
    </section>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_restore_backup }}</div>
      </div>
      <div class="subpage-section-desc">{{ restoreHint }}</div>
      <div class="subpage-card subpage-form-card">
        <label class="subpage-field">
          <span class="subpage-field-label">{{ i18n.ui_select_backup }}</span>
          <select class="subpage-select" v-model="webdav.selectedFile">
            <option disabled value="">
              {{ i18n.webdav_choose_backup || "Choose a backup file" }}
            </option>
            <option
              v-for="file in webdav.files"
              :key="file.name"
              :value="file.name"
            >
              {{ formatWebDAVFile(file) }}
            </option>
          </select>
        </label>

        <label class="webdav-toggle-field">
          <span class="subpage-row-copy">
            <span class="subpage-row-title">
              {{
                i18n.webdav_clear_before_restore ||
                "Clear existing data before restore"
              }}
            </span>
            <span class="subpage-row-desc">
              {{
                i18n.webdav_clear_before_restore_desc ||
                "Delete all current accounts before importing the selected backup."
              }}
            </span>
          </span>
          <span class="subpage-switch">
            <input
              type="checkbox"
              v-model="webdav.clearBeforeRestore"
              @change="updateClearBeforeRestorePreference"
            />
            <span class="subpage-switch-track"></span>
          </span>
        </label>

        <div class="subpage-actions webdav-restore-actions">
          <button
            type="button"
            class="subpage-button primary"
            :disabled="!webdav.selectedFile || webdav.isRestoring"
            @click="restoreFromWebDAV"
          >
            {{
              webdav.isRestoring
                ? i18n.ui_restoring
                : i18n.webdav_restore_button || "Restore selected backup"
            }}
          </button>
          <button
            type="button"
            class="subpage-button"
            v-if="webdav.isRestoring && webdav.restoreCanCancel"
            @click="cancelWebDAVRestore"
          >
            {{ i18n.ui_cancel_import }}
          </button>
          <button
            type="button"
            class="subpage-button danger"
            :disabled="webdav.isRestoring"
            @click="handleClearAllData"
          >
            {{ i18n.backup_clear_button || "Clear all data" }}
          </button>
        </div>

        <div class="webdav-transfer-progress" v-if="webdav.isRestoring">
          <div class="webdav-transfer-progress-head">
            <span>{{ webdav.restoreProgressLabel }}</span>
            <span>{{ webdav.restoreProgress }}%</span>
          </div>
          <div
            class="webdav-transfer-progress-track"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="webdav.restoreProgress"
          >
            <span
              class="webdav-transfer-progress-fill"
              :style="{ width: webdav.restoreProgress + '%' }"
            ></span>
          </div>
        </div>
      </div>
    </section>

    <div
      class="subpage-dialog-backdrop"
      v-if="restorePassphraseDialogOpen"
      role="presentation"
      @click.self="cancelRestorePassphrase"
      @keydown.esc.stop.prevent="cancelRestorePassphrase"
    >
      <form
        class="subpage-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'webdavRestorePasswordTitle'"
        @submit.prevent="submitRestorePassphrase"
      >
        <div class="subpage-dialog-title" id="webdavRestorePasswordTitle">
          {{ i18n.ui_backup_password_title }}
        </div>
        <div class="subpage-dialog-desc">
          {{ i18n.ui_backup_password_desc }}
        </div>
        <label class="subpage-field">
          <span class="subpage-field-label">{{ i18n.phrase }}</span>
          <input
            ref="restorePassphraseInput"
            class="subpage-text-input"
            type="password"
            v-model="restorePassphrase"
            autocomplete="current-password"
          />
        </label>
        <div class="subpage-actions">
          <button
            type="button"
            class="subpage-button"
            @click="cancelRestorePassphrase"
          >
            {{ i18n.cancel }}
          </button>
          <button
            type="submit"
            class="subpage-button primary"
            :disabled="!restorePassphrase"
          >
            {{ i18n.ok }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import IconDatabase from "../../../svg/database.svg";
import IconSync from "../../../svg/sync.svg";
import { Encryption } from "../../models/encryption";
import { MAX_BACKUP_CONTENT_BYTES } from "../../models/import-limits";
import {
  applyDecryptedBackup,
  decryptParsedBackup,
} from "../../models/import-service";
import { parseBackupContentOffThread } from "../../models/import-worker-client";
import {
  downloadWebDAVBackup,
  getWebDAVConfig,
  listWebDAVBackups,
  saveWebDAVConfig,
  testWebDAVConnection,
  uploadWebDAVBackup,
  pruneWebDAVBackups,
  type WebDAVConfig,
  type WebDAVFile,
  getWebDAVOrigin,
} from "../../models/webdav";
import { UserSettings } from "../../models/settings";

export default Vue.extend({
  props: {
    embedded: {
      type: Boolean,
      default: false,
    },
  },
  components: {
    IconDatabase,
    IconSync,
  },
  data: function () {
    return {
      webdav: {
        serverUrl: "",
        username: "",
        password: "",
        encrypted: "true",
        autoBackup: true,
        clearBeforeRestore: false,
        maxBackups: 0,
        files: [] as WebDAVFile[],
        selectedFile: "",
        isTesting: false,
        isBackingUp: false,
        isLoadingList: false,
        isRestoring: false,
        isSaving: false,
        message: "",
        lastBackupDay: 0,
        restoreProgress: 0,
        restoreProgressLabel: "",
        restoreCanCancel: false,
      },
      restoreAbortController: null as AbortController | null,
      restorePassphraseDialogOpen: false,
      restorePassphrase: "",
      restorePassphraseResolver: null as
        | ((passphrase: string | null) => void)
        | null,
    };
  },
  created() {
    this.loadWebDAVSettings();
  },
  beforeDestroy() {
    this.restoreAbortController?.abort();
    this.cancelRestorePassphrase();
  },
  computed: {
    currentlyEncrypted: function () {
      return this.$store.getters["accounts/currentlyEncrypted"];
    },
    webdavConfig(): WebDAVConfig {
      return {
        url: this.webdav.serverUrl.trim(),
        username: this.webdav.username.trim(),
        password: this.webdav.password,
        encrypted: this.webdav.encrypted === "true",
      };
    },
    lastBackupLabel(): string {
      if (!this.webdav.lastBackupDay) {
        return this.i18n.webdav_never_backed_up || "Never backed up";
      }
      const ms = this.webdav.lastBackupDay * 24 * 60 * 60 * 1000;
      return new Date(ms).toLocaleDateString();
    },
    restoreHint(): string {
      return this.webdav.files.length
        ? `${this.webdav.files.length} ${this.i18n.ui_backups_found} · ${this.i18n.ui_latest_backup} ${this.lastBackupLabel}`
        : this.i18n.webdav_no_files || "No restorable backup files were found.";
    },
  },
  methods: {
    async loadWebDAVSettings() {
      const config = await getWebDAVConfig();
      this.webdav.serverUrl = config.url;
      this.webdav.username = config.username;
      this.webdav.password = config.password;
      this.webdav.encrypted = config.encrypted ? "true" : "false";
      this.webdav.autoBackup = UserSettings.items.webdavAutoBackup !== false;
      this.webdav.clearBeforeRestore =
        UserSettings.items.webdavClearBeforeRestore === true;
      this.webdav.maxBackups = Number(
        UserSettings.items.webdavMaxBackups || 0
      );
      this.webdav.lastBackupDay = Number(
        UserSettings.items.webdavLastBackupTime || 0
      );
      if (config.url) {
        this.refreshWebDAVList(true);
      }
    },
    async saveWebDAVSettings() {
      if (!this.validateWebDAVFields()) {
        this.notify(this.i18n.webdav_settings_missing);
        return;
      }
      const granted = await this.ensureWebDAVPermission();
      if (!granted) {
        return;
      }
      this.webdav.isSaving = true;
      try {
        await saveWebDAVConfig(this.webdavConfig);
        UserSettings.items.webdavMaxBackups = this.webdav.maxBackups;
        await UserSettings.commitItems();
        this.notify(this.i18n.updateSuccess);
      } finally {
        this.webdav.isSaving = false;
      }
    },
    async testWebDAV() {
      if (!(await this.ensureWebDAVReady())) {
        return;
      }
      this.webdav.isTesting = true;
      try {
        const success = await testWebDAVConnection();
        this.notify(
          success
            ? this.i18n.webdav_connection_success
            : this.i18n.webdav_connection_failure
        );
      } catch (error) {
        this.notify(this.i18n.webdav_connection_failure);
      } finally {
        this.webdav.isTesting = false;
      }
    },
    async backupToWebDAV(showToast = true) {
      if (this.currentlyEncrypted) {
        this.notify(this.i18n.phrase_incorrect_export);
        return false;
      }
      if (!(await this.ensureWebDAVReady())) {
        return false;
      }
      const encryption = this.getActiveEncryption();

      // Check if user selected encrypted backup but no password is set
      if (this.webdavConfig.encrypted && (!encryption || !encryption.getEncryptionStatus())) {
        this.notify(
          this.i18n.backup_set_password_alert ||
            this.i18n.ui_create_password_first
        );
        return false;
      }

      if (!encryption) {
        this.notify(this.i18n.import_error_password);
        return false;
      }
      this.webdav.isBackingUp = true;
      try {
        const success = await uploadWebDAVBackup(
          encryption,
          this.webdavConfig.encrypted
        );
        if (showToast) {
          this.notify(
            success
              ? this.i18n.webdav_backup_success
              : this.i18n.webdav_backup_failure
          );
        }
        if (success) {
          await this.recordBackupDay();
          await this.cleanupOldBackups();
          await this.refreshWebDAVList(true);
        }
        return success;
      } catch (error) {
        if (showToast) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.notify(
            errorMsg === "webdavTimeout"
              ? this.i18n.ui_error_webdav_timeout
              : errorMsg === "backupContentTooLarge"
              ? this.i18n.ui_error_backup_too_large
              : this.i18n.webdav_backup_failure +
                (errorMsg ? ": " + errorMsg : "")
          );
        }
        return false;
      } finally {
        this.webdav.isBackingUp = false;
      }
    },
    async refreshWebDAVList(silent = false) {
      if (!this.validateWebDAVFields()) {
        return;
      }
      const granted = await this.ensureWebDAVPermission();
      if (!granted) {
        return;
      }
      this.webdav.isLoadingList = true;
      if (!silent) {
        this.webdav.message = this.i18n.webdav_loading_files;
      }
      try {
        // Clear the current list first so the refreshed state is unambiguous.
        this.webdav.files = [];
        const files = await listWebDAVBackups();
        this.webdav.files = files;
        if (!files.length) {
          this.webdav.message = this.i18n.webdav_no_files;
          this.webdav.selectedFile = "";
        } else {
          this.webdav.message = "";
          if (!this.webdav.selectedFile) {
            this.webdav.selectedFile = files[0].name;
          }
        }
      } catch (error) {
        this.webdav.message = this.i18n.webdav_fetch_failed;
      } finally {
        this.webdav.isLoadingList = false;
      }
    },
    async restoreFromWebDAV() {
      if (!this.webdav.selectedFile) {
        this.notify(this.i18n.webdav_choose_backup);
        return;
      }
      if (this.currentlyEncrypted) {
        this.notify(this.i18n.import_error_password);
        return;
      }
      if (!(await this.ensureWebDAVReady())) {
        return;
      }
      const selectedFile = this.webdav.files.find(
        (file) => file.name === this.webdav.selectedFile
      );
      if (
        selectedFile?.size &&
        selectedFile.size > MAX_BACKUP_CONTENT_BYTES
      ) {
        this.notify(this.i18n.ui_error_backup_too_large);
        return;
      }
      const encryption = this.getActiveEncryption();
      if (!encryption) {
        this.notify(this.i18n.import_error_password);
        return;
      }
      const controller = new AbortController();
      this.restoreAbortController = controller;
      this.webdav.isRestoring = true;
      this.webdav.restoreCanCancel = true;
      this.setRestoreProgress(2, this.i18n.ui_progress_downloading_backup);
      try {
        const content = await downloadWebDAVBackup(this.webdav.selectedFile, {
          signal: controller.signal,
          onDownloadProgress: (loadedBytes, totalBytes) => {
            const ratio = totalBytes
              ? loadedBytes / totalBytes
              : loadedBytes / MAX_BACKUP_CONTENT_BYTES;
            this.setRestoreProgress(
              3 + Math.min(1, ratio) * 42,
              this.i18n.ui_progress_downloading_backup
            );
          },
        });
        await this.restoreFromBackupContent(
          content,
          encryption,
          this.webdav.clearBeforeRestore,
          controller.signal,
          (value, label) => this.setRestoreProgress(value, label)
        );
        this.setRestoreProgress(100, this.i18n.webdav_restore_success);
        this.notify(this.i18n.webdav_restore_success);
      } catch (error) {
        const message = (error as Error).message;
        if (message === "cancelled" || message === "importCancelled") {
          this.notify(this.i18n.webdav_restore_cancelled);
        } else if (message === "parseError") {
          this.notify(this.i18n.webdav_restore_parse_error);
        } else if (message === "incorrectPassphrase") {
          this.notify(this.i18n.ui_incorrect_backup_password);
        } else if (message === "backupContentTooLarge") {
          this.notify(this.i18n.ui_error_backup_too_large);
        } else if (message === "webdavTimeout") {
          this.notify(this.i18n.ui_error_webdav_timeout);
        } else {
          this.notify(this.i18n.webdav_restore_failure);
        }
      } finally {
        this.webdav.isRestoring = false;
        this.webdav.restoreCanCancel = false;
        this.restoreAbortController = null;
      }
    },
    cancelWebDAVRestore() {
      this.restoreAbortController?.abort();
      this.cancelRestorePassphrase();
      this.setRestoreProgress(100, this.i18n.webdav_restore_cancelled);
    },
    async handleClearAllData() {
      if (
        !(await this.$store.dispatch(
          "notification/confirm",
          this.i18n.backup_clear_confirm
        ))
      ) {
        return;
      }
      let proceed = true;
      if (
        await this.$store.dispatch(
          "notification/confirm",
          this.i18n.backup_clear_backup_prompt
        )
      ) {
        const success = await this.backupToWebDAV(false);
        if (!success) {
          proceed = await this.$store.dispatch(
            "notification/confirm",
            this.i18n.webdav_backup_failure
          );
        }
      }
      if (!proceed) {
        return;
      }
      await this.$store.dispatch("accounts/clearAllData");
      await this.$store.dispatch("accounts/updateEntries");
      this.notify(this.i18n.backup_clear_success);
    },
    async restoreFromBackupContent(
      content: string,
      encryption: Encryption,
      clearFirst: boolean,
      signal?: AbortSignal,
      onProgress?: (value: number, label: string) => void
    ) {
      onProgress?.(48, this.i18n.ui_progress_parsing_backup);
      const parsedBackup = await parseBackupContentOffThread(content, {
        signal,
        onProgress: (value) =>
          onProgress?.(
            48 + value * 0.16,
            this.i18n.ui_progress_parsing_backup
          ),
      });
      const passphrase = parsedBackup.requiresPassphrase
        ? await this.promptRestorePassphrase()
        : null;
      if (parsedBackup.requiresPassphrase && !passphrase) {
        throw new Error("cancelled");
      }
      onProgress?.(
        68,
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

      try {
        this.webdav.restoreCanCancel = false;
        await applyDecryptedBackup(decryptedBackup, {
          encryption,
          clearFirst,
          onProgress: (value, key) =>
            onProgress?.(value, this.i18n[key] || key),
          refresh: async () => {
            await this.$store.dispatch("groups/refreshGroups");
            await this.$store.dispatch("accounts/updateEntries");
          },
          signal,
        });
      } catch (error) {
        if ((error as Error).message === "noImportableEntries") {
          throw new Error("parseError");
        }
        throw error;
      }

      if (failedCount > 0 && succeededCount === 0) {
        this.notify(this.i18n.migration_fail);
      } else if (failedCount > 0) {
        this.notify(this.i18n.migration_partly_fail);
      }
    },
    async promptRestorePassphrase() {
      this.cancelRestorePassphrase();
      this.restorePassphrase = "";
      this.restorePassphraseDialogOpen = true;
      this.$nextTick(() => {
        const input = this.$refs.restorePassphraseInput as
          | HTMLInputElement
          | undefined;
        input?.focus();
      });
      return new Promise<string | null>((resolve) => {
        this.restorePassphraseResolver = resolve;
      });
    },
    submitRestorePassphrase() {
      if (!this.restorePassphrase || !this.restorePassphraseResolver) {
        return;
      }
      const resolver = this.restorePassphraseResolver;
      const passphrase = this.restorePassphrase;
      this.restorePassphraseResolver = null;
      this.restorePassphraseDialogOpen = false;
      this.restorePassphrase = "";
      resolver(passphrase);
    },
    cancelRestorePassphrase() {
      const resolver = this.restorePassphraseResolver;
      this.restorePassphraseResolver = null;
      this.restorePassphraseDialogOpen = false;
      this.restorePassphrase = "";
      resolver?.(null);
    },
    validateWebDAVFields() {
      return (
        this.webdav.serverUrl.trim() &&
        this.webdav.username.trim() &&
        this.webdav.password
      );
    },
    async ensureWebDAVReady() {
      if (!this.validateWebDAVFields()) {
        this.notify(this.i18n.webdav_settings_missing);
        return false;
      }
      const granted = await this.ensureWebDAVPermission();
      if (!granted) {
        return false;
      }
      await saveWebDAVConfig(this.webdavConfig);
      return true;
    },
    getOriginFromUrl(url: string) {
      return getWebDAVOrigin(url);
    },
    ensureWebDAVPermission(): Promise<boolean> {
      return new Promise((resolve) => {
        const origin = this.getOriginFromUrl(this.webdav.serverUrl);
        if (!origin) {
          this.notify(this.i18n.webdav_invalid_url);
          resolve(false);
          return;
        }
        chrome.permissions.request({ origins: [origin] }, (granted) => {
          if (!granted) {
            this.notify(this.i18n.webdav_permission_denied);
          }
          resolve(Boolean(granted));
        });
      });
    },
    getActiveEncryption(): Encryption | null {
      const defaultKeyId = this.$store.state.accounts.defaultEncryption;
      if (!defaultKeyId) {
        return new Encryption("", "");
      }
      const encryption = this.$store.state.accounts.encryption.get(
        defaultKeyId
      );
      return encryption || new Encryption("", "");
    },
    formatWebDAVFile(file: WebDAVFile) {
      const size =
        file.size && file.size > 0 ? ` (${this.formatBytes(file.size)})` : "";
      const date = file.lastModified
        ? ` - ${new Date(file.lastModified).toLocaleString()}`
        : "";
      return `${file.displayName}${size}${date}`;
    },
    formatBytes(bytes: number) {
      if (!bytes) {
        return "0 B";
      }
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      const value = bytes / Math.pow(1024, i);
      return `${value.toFixed(1)} ${sizes[i]}`;
    },
    notify(message: string) {
      this.$store.commit("notification/alert", message);
    },
    setRestoreProgress(value: number, label: string) {
      this.webdav.restoreProgress = Math.max(
        0,
        Math.min(100, Math.round(value))
      );
      this.webdav.restoreProgressLabel = label;
    },
    updateAutoBackupPreference() {
      UserSettings.items.webdavAutoBackup = this.webdav.autoBackup;
      UserSettings.commitItems();
    },
    updateClearBeforeRestorePreference() {
      UserSettings.items.webdavClearBeforeRestore =
        this.webdav.clearBeforeRestore;
      UserSettings.commitItems();
    },
    updateMaxBackupsPreference() {
      const maxBackups = Math.max(0, Number(this.webdav.maxBackups) || 0);
      this.webdav.maxBackups = maxBackups;
      UserSettings.items.webdavMaxBackups = maxBackups;
      UserSettings.commitItems();
    },
    async recordBackupDay(day = getClientDay()) {
      this.webdav.lastBackupDay = day;
      UserSettings.items.webdavLastBackupTime = day;
      await UserSettings.commitItems();
    },
    async cleanupOldBackups() {
      const maxBackups = this.webdav.maxBackups;
      if (!maxBackups || maxBackups <= 0) {
        return;
      }
      await pruneWebDAVBackups(maxBackups);
    },
  },
});

function getClientDay() {
  return Math.floor(new Date().getTime() / 1000 / 3600 / 24);
}
</script>
