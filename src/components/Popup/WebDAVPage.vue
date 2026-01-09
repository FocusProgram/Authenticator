<template>
  <div
    class="webdav-page"
    style="
      padding: 8px;
      background: linear-gradient(180deg, #f5f7fb 0%, #fdfdff 100%);
    "
  >
    <div
      class="card-grid"
      style="display: flex; flex-direction: column; gap: 16px"
    >
      <section
        class="card"
        style="
          background: rgba(255, 255, 255, 0.9);
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(6px);
        "
      >
        <header style="margin-bottom: 12px">
          <div style="font-size: 15px; font-weight: 600; color: #111827">
            {{ i18n.webdav_card_connection }}
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px">
            {{ lastBackupLabel }}
          </div>
        </header>
        <div class="input-grid" style="display: grid; gap: 12px">
          <div
            class="control-group"
            style="width: 100%; display: flex; flex-direction: column; gap: 4px"
          >
            <label style="font-size: 13px; color: #111827">
              {{ i18n.webdav_server_url }}
            </label>
            <input
              class="input"
              type="text"
              v-model="webdav.serverUrl"
              placeholder="https://example.com/webdav"
              style="width: 100%; box-sizing: border-box"
            />
          </div>
          <div
            class="control-group"
            style="width: 100%; display: flex; flex-direction: column; gap: 4px"
          >
            <label style="font-size: 13px; color: #111827">
              {{ i18n.webdav_username }}
            </label>
            <input
              class="input"
              type="text"
              v-model="webdav.username"
              :placeholder="i18n.webdav_username"
              style="width: 100%; box-sizing: border-box"
            />
          </div>
          <div
            class="control-group"
            style="width: 100%; display: flex; flex-direction: column; gap: 4px"
          >
            <label style="font-size: 13px; color: #111827">
              {{ i18n.webdav_password }}
            </label>
            <input
              class="input"
              type="password"
              v-model="webdav.password"
              :placeholder="i18n.webdav_password"
              style="width: 100%; box-sizing: border-box"
            />
          </div>
          <div style="width: 100%">
            <a-select-input
              label="存储方式"
              v-model="webdav.encrypted"
              style="width: 100%"
            >
              <option value="true">
                {{ i18n.webdav_backup_option_encrypted }}
              </option>
              <option value="false">
                {{ i18n.webdav_backup_option_plain }}
              </option>
            </a-select-input>
          </div>
          <div
            class="control-group"
            style="width: 100%; display: flex; flex-direction: column; gap: 4px"
          >
            <label style="font-size: 13px; color: #111827">
              最大备份数量（0表示不限制）
            </label>
            <input
              class="input"
              type="number"
              v-model.number="webdav.maxBackups"
              min="0"
              placeholder="0"
              style="width: 100%; box-sizing: border-box"
            />
          </div>
        </div>
        <div
          class="button-row"
          style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px"
        >
          <a-button @click="testWebDAV" :disabled="webdav.isTesting">
            {{ i18n.webdav_test_connection }}
          </a-button>
          <a-button @click="saveWebDAVSettings" :disabled="webdav.isSaving">
            {{ i18n.webdav_save }}
          </a-button>
        </div>
      </section>

      <section
        class="card"
        style="
          background: rgba(255, 255, 255, 0.9);
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(6px);
        "
      >
        <header style="margin-bottom: 12px">
          <div style="font-size: 15px; font-weight: 600; color: #111827">
            {{ i18n.webdav_card_backup }}
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px">
            {{ i18n.webdav_last_backup }} · {{ lastBackupLabel }}
          </div>
        </header>
        <label
          class="toggle"
          style="
            display: flex;
            gap: 12px;
            align-items: flex-start;
            padding: 12px 0;
          "
        >
          <input
            type="checkbox"
            v-model="webdav.autoBackup"
            @change="updateAutoBackupPreference"
            style="margin-top: 4px"
          />
          <div>
            <div style="font-weight: 600; font-size: 14px">
              {{ i18n.webdav_auto_backup }}
            </div>
            <div style="font-size: 12px; color: #6b7280">
              {{ i18n.webdav_auto_backup_desc }}
            </div>
          </div>
        </label>
        <div
          class="button-row"
          style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px"
        >
          <a-button @click="backupToWebDAV" :disabled="webdav.isBackingUp">
            {{ i18n.webdav_backup_button }}
          </a-button>
          <a-button @click="refreshWebDAVList" :disabled="webdav.isLoadingList">
            {{ i18n.webdav_refresh_list }}
          </a-button>
        </div>
        <p
          style="margin-top: 8px; font-size: 12px; color: #6b7280"
          v-if="webdav.message"
        >
          {{ webdav.message }}
        </p>
      </section>

      <section
        class="card"
        style="
          background: rgba(255, 255, 255, 0.9);
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(6px);
        "
      >
        <header style="margin-bottom: 12px">
          <div style="font-size: 15px; font-weight: 600; color: #111827">
            {{ i18n.webdav_card_restore }}
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px">
            {{ restoreHint }}
          </div>
        </header>
        <div
          class="control-group"
          style="width: 100%; display: flex; flex-direction: column; gap: 4px"
        >
          <label style="font-size: 13px; color: #111827">
            {{ i18n.webdav_choose_backup }}
          </label>
          <select
            class="input"
            v-model="webdav.selectedFile"
            style="width: 100%; box-sizing: border-box"
          >
            <option disabled value="">
              {{ i18n.webdav_choose_backup }}
            </option>
            <option
              v-for="file in webdav.files"
              :key="file.name"
              :value="file.name"
            >
              {{ formatWebDAVFile(file) }}
            </option>
          </select>
        </div>
        <label
          class="toggle"
          style="
            display: flex;
            gap: 12px;
            align-items: flex-start;
            padding: 12px 0;
          "
        >
          <input
            type="checkbox"
            v-model="webdav.clearBeforeRestore"
            @change="updateClearBeforeRestorePreference"
            style="margin-top: 4px"
          />
          <div>
            <div style="font-weight: 600; font-size: 14px">
              {{ i18n.webdav_clear_before_restore }}
            </div>
            <div style="font-size: 12px; color: #6b7280">
              {{ i18n.webdav_clear_before_restore_desc }}
            </div>
          </div>
        </label>
        <div
          class="button-row"
          style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px"
        >
          <a-button
            @click="restoreFromWebDAV"
            :disabled="!webdav.selectedFile || webdav.isRestoring"
          >
            {{ i18n.webdav_restore_button }}
          </a-button>
          <a-button
            class="danger"
            @click="handleClearAllData"
            style="background: #fee2e2; color: #b91c1c"
          >
            {{ i18n.backup_clear_button }}
          </a-button>
        </div>
      </section>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import * as CryptoJS from "crypto-js";
import {
  decryptBackupData,
  getEntryDataFromOTPAuthPerLine,
} from "../../models/import-utils";
import { EntryStorage } from "../../models/storage";
import { Encryption } from "../../models/encryption";
import {
  downloadWebDAVBackup,
  getWebDAVConfig,
  listWebDAVBackups,
  saveWebDAVConfig,
  testWebDAVConnection,
  uploadWebDAVBackup,
  deleteWebDAVBackup,
  type WebDAVConfig,
  type WebDAVFile,
  getWebDAVOrigin,
} from "../../models/webdav";
import { UserSettings } from "../../models/settings";

export default Vue.extend({
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
      },
    };
  },
  created() {
    this.loadWebDAVSettings();
  },
  computed: {
    defaultEncryption: function () {
      return this.$store.state.accounts.defaultEncryption;
    },
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
        return this.i18n.webdav_never_backed_up;
      }
      const ms = this.webdav.lastBackupDay * 24 * 60 * 60 * 1000;
      return new Date(ms).toLocaleDateString();
    },
    restoreHint(): string {
      return this.webdav.files.length
        ? `${this.webdav.files.length} · ${this.lastBackupLabel}`
        : this.i18n.webdav_no_files;
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
        this.notify(this.i18n.backup_set_password_alert || "请先在「设置 → 安全」中设置密码，才能进行加密备份");
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
          this.recordBackupDay();
          await this.refreshWebDAVList(true);
          // Clean up old backups if max limit is set
          await this.cleanupOldBackups();
        }
        return success;
      } catch (error) {
        if (showToast) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.notify(this.i18n.webdav_backup_failure + (errorMsg ? ": " + errorMsg : ""));
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
        // 强制刷新：清除当前文件列表，确保显示最新数据
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
      const encryption = this.getActiveEncryption();
      if (!encryption) {
        this.notify(this.i18n.import_error_password);
        return;
      }
      this.webdav.isRestoring = true;
      try {
        const content = await downloadWebDAVBackup(this.webdav.selectedFile);
        await this.restoreFromBackupContent(
          content,
          encryption,
          this.webdav.clearBeforeRestore
        );
        this.notify(this.i18n.webdav_restore_success);
      } catch (error) {
        const message = (error as Error).message;
        if (message === "cancelled") {
          this.notify(this.i18n.webdav_restore_cancelled);
        } else if (message === "parseError") {
          this.notify(this.i18n.webdav_restore_parse_error);
        } else {
          this.notify(this.i18n.webdav_restore_failure);
        }
      } finally {
        this.webdav.isRestoring = false;
      }
    },
    async handleClearAllData() {
      if (!window.confirm(this.i18n.backup_clear_confirm)) {
        return;
      }
      let proceed = true;
      if (window.confirm(this.i18n.backup_clear_backup_prompt)) {
        const success = await this.backupToWebDAV(false);
        if (!success) {
          proceed = window.confirm(this.i18n.webdav_backup_failure);
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
      clearFirst: boolean
    ) {
      let importData = {} as Record<string, RawOTPStorage | Key> & {
        key?: { enc: string; hash: string };
        enc?: string;
        hash?: string;
      };
      let failedCount = 0;
      let succeededCount = 0;
      try {
        importData = JSON.parse(content);
        succeededCount = Object.keys(importData).filter(
          (key) => ["key", "enc", "hash"].indexOf(key) === -1
        ).length;
      } catch {
        const result = await getEntryDataFromOTPAuthPerLine(content);
        importData = result.exportData;
        failedCount = result.failedCount;
        succeededCount = result.succeededCount;
      }

      let key: { enc: string } | null = null;
      if (importData.key) {
        key = importData.key;
        delete importData.key;
      } else if (importData.enc && importData.hash) {
        key = { enc: importData.enc };
        delete importData.hash;
        delete importData.enc;
      }

      let decryptedFileData: { [hash: string]: RawOTPStorage } = {};
      let requiresPassphrase = false;
      for (const hash in importData) {
        const possibleEntry = importData[hash] as any;
        if (!possibleEntry || possibleEntry.dataType === "Key") {
          continue;
        }
        if (
          possibleEntry.dataType === "EncOTPStorage" ||
          possibleEntry.keyId ||
          possibleEntry.encrypted
        ) {
          requiresPassphrase = true;
          break;
        }
      }

      if (requiresPassphrase) {
        const passphrase = await this.promptRestorePassphrase();
        if (!passphrase) {
          throw new Error("cancelled");
        }
        const unlockKey = key
          ? CryptoJS.AES.decrypt(key.enc, passphrase).toString()
          : passphrase;
        decryptedFileData = await decryptBackupData(importData, unlockKey);
      } else {
        for (const hash in importData) {
          const entry = importData[hash] as RawOTPStorage;
          if (entry && !entry.encrypted) {
            decryptedFileData[hash] = entry;
          }
        }
      }

      if (!Object.keys(decryptedFileData).length) {
        throw new Error("parseError");
      }

      if (clearFirst) {
        await this.$store.dispatch("accounts/clearAllData");
        await this.$store.dispatch("accounts/updateEntries");
      }

      // Use empty encryption to prevent re-encrypting already decrypted backup data
      const emptyEncryption = new Encryption("", "");
      await EntryStorage.import(emptyEncryption, decryptedFileData);
      await this.$store.dispatch("accounts/updateEntries");

      if (failedCount > 0 && succeededCount === 0) {
        this.notify(this.i18n.migration_fail);
      } else if (failedCount > 0) {
        this.notify(this.i18n.migration_partly_fail);
      }
    },
    async promptRestorePassphrase() {
      const input = window.prompt(this.i18n.webdav_restore_passphrase_prompt);
      if (input === null || input === "") {
        return null;
      }
      return input;
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
    updateAutoBackupPreference() {
      UserSettings.items.webdavAutoBackup = this.webdav.autoBackup;
      UserSettings.commitItems();
    },
    updateClearBeforeRestorePreference() {
      UserSettings.items.webdavClearBeforeRestore =
        this.webdav.clearBeforeRestore;
      UserSettings.commitItems();
    },
    recordBackupDay(day = getClientDay()) {
      this.webdav.lastBackupDay = day;
      UserSettings.items.webdavLastBackupTime = day;
      UserSettings.commitItems();
    },
    async cleanupOldBackups() {
      const maxBackups = this.webdav.maxBackups;
      if (!maxBackups || maxBackups <= 0) {
        // No limit set
        return;
      }

      const files = this.webdav.files;
      if (files.length <= maxBackups) {
        // Within limit
        return;
      }

      // Sort files by last modified (newest first)
      const sortedFiles = [...files].sort((a, b) => {
        if (a.lastModified && b.lastModified) {
          return (
            new Date(b.lastModified).getTime() -
            new Date(a.lastModified).getTime()
          );
        }
        return b.name.localeCompare(a.name);
      });

      // Delete old files beyond the limit
      const filesToDelete = sortedFiles.slice(maxBackups);
      for (const file of filesToDelete) {
        try {
          await deleteWebDAVBackup(file.name);
        } catch (error) {
          console.error("Failed to delete old backup:", file.name, error);
        }
      }

      // Refresh file list after cleanup
      await this.refreshWebDAVList(true);
    },
  },
});

function getClientDay() {
  return Math.floor(new Date().getTime() / 1000 / 3600 / 24);
}
</script>
