<template>
  <div>
    <!-- File Backup -->
    <div v-show="!exportDisabled">
      <div class="text warning" v-if="!defaultEncryption">
        {{ i18n.export_info }}
      </div>
      <div class="text">
        {{ i18n.backup_file_info }}
      </div>
      <div class="text warning" v-if="unsupportedAccounts">
        {{ i18n.otp_unsupported_warn }}
      </div>
      <div class="text warning" v-if="currentlyEncrypted">
        {{ i18n.phrase_incorrect_export }}
      </div>
      <a-button-link
        download="authenticator.txt"
        :href="exportOneLineOtpAuthFile"
        v-if="!unsupportedAccounts && isDataLinkSupported"
        >{{ i18n.download_backup }}</a-button-link
      >
      <button
        v-on:click="downloadBackUpOneLineOtpAuthFile()"
        v-if="!unsupportedAccounts && !isDataLinkSupported"
        class="button"
      >
        {{ i18n.download_backup }}
      </button>
      <a-button-link
        download="authenticator.csv"
        :href="exportCsvFile"
        v-if="!unsupportedAccounts && isDataLinkSupported"
        >Download CSV</a-button-link
      >
      <button
        v-on:click="downloadBackUpCsvFile()"
        v-if="!unsupportedAccounts && !isDataLinkSupported"
        class="button"
      >
        Download CSV
      </button>
      <a-button-link
        download="authenticator.json"
        :href="exportFile"
        v-if="unsupportedAccounts && isDataLinkSupported"
        >{{ i18n.download_backup }}</a-button-link
      >
      <button
        v-on:click="downloadBackUpExportFile()"
        v-if="unsupportedAccounts && !isDataLinkSupported"
        class="button"
      >
        {{ i18n.download_backup }}
      </button>
      <a-button-link
        download="authenticator.json"
        :href="exportEncryptedFile"
        v-if="!!defaultEncryption && isDataLinkSupported"
        >{{ i18n.download_enc_backup }}</a-button-link
      >
      <button
        v-on:click="downloadBackUpExportEncryptedFile()"
        v-if="!!defaultEncryption && !isDataLinkSupported"
        class="button"
      >
        {{ i18n.download_enc_backup }}
      </button>
    </div>
    <a-button-link href="import.html">{{ i18n.import_backup }}</a-button-link>
    <br />
    <!-- 3rd Party Backup Services -->
    <div v-show="!backupDisabled && isBackupServiceSupported">
      <div class="text">
        {{ i18n.storage_sync_info }}
      </div>
      <p></p>
      <!-- Temporarily hidden: Google Drive, OneDrive, Dropbox -->
      <!-- <a-button @click="showInfo('DrivePage')"> Google Drive </a-button> -->
      <!-- <a-button @click="showInfo('OneDrivePage')"> OneDrive </a-button> -->
      <!-- <a-button @click="showInfo('DropboxPage')"> Dropbox </a-button> -->
      <a-button @click="showInfo('WebDAVPage')"> WebDAV </a-button>
    </div>
    <div class="control-group">
      <a-button class="button" @click="handleClearAllData">
        {{ i18n.backup_clear_button }}
      </a-button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isSafari } from "../../browser";
import { EntryStorage } from "../../models/storage";

export default Vue.extend({
  computed: {
    exportData(): { [h: string]: RawOTPStorage } {
      // Compute export data from current entries in real-time
      const entries = this.$store.getters["accounts/entries"];
      const result = EntryStorage.getExport(entries);
      return (typeof result === "object" && result !== null ? result : {}) as {
        [h: string]: RawOTPStorage;
      };
    },
    exportEncData(): { [h: string]: RawOTPStorage } {
      // Compute encrypted export data from current entries in real-time
      const entries = this.$store.getters["accounts/entries"];
      const result = EntryStorage.getExport(entries, true);
      return (typeof result === "object" && result !== null ? result : {}) as {
        [h: string]: RawOTPStorage;
      };
    },
    key(): Object | undefined {
      return this.$store.state.accounts.key;
    },
    unsupportedAccounts(): boolean {
      return hasUnsupportedAccounts(this.exportData);
    },
    exportFile(): string {
      return getBackupFile(this.exportData);
    },
    exportEncryptedFile(): string {
      return getBackupFile(this.exportEncData, this.key);
    },
    exportOneLineOtpAuthFile(): string {
      return getOneLineOtpBackupFile(this.exportData);
    },
    exportCsvFile(): string {
      return getCsvBackupFile(this.exportData);
    },
    defaultEncryption: function () {
      return this.$store.state.accounts.defaultEncryption;
    },
    exportDisabled: function () {
      return this.$store.state.menu.exportDisabled;
    },
    currentlyEncrypted: function () {
      return this.$store.getters["accounts/currentlyEncrypted"];
    },
    backupDisabled: function () {
      return this.$store.state.menu.backupDisabled;
    },
    isDataLinkSupported: function () {
      return !isSafari;
    },
    isBackupServiceSupported: function () {
      return !isSafari;
    },
  },
  methods: {
    showInfo(tab: string) {
      if (tab === "DropboxPage") {
        chrome.permissions.request(
          { origins: ["https://*.dropboxapi.com/*"] },
          async (granted) => {
            if (granted) {
              this.$store.commit("style/showInfo");
              this.$store.commit("currentView/changeView", tab);
            }
          }
        );
        return;
      } else if (tab === "DrivePage") {
        chrome.permissions.request(
          {
            origins: [
              "https://www.googleapis.com/*",
              "https://accounts.google.com/o/oauth2/revoke",
            ],
          },
          async (granted) => {
            if (granted) {
              this.$store.commit("style/showInfo");
              this.$store.commit("currentView/changeView", tab);
            }
            return;
          }
        );
        return;
      } else if (tab === "OneDrivePage") {
        chrome.permissions.request(
          {
            origins: [
              "https://graph.microsoft.com/me/*",
              "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            ],
          },
          async (granted) => {
            if (granted) {
              this.$store.commit("style/showInfo");
              this.$store.commit("currentView/changeView", tab);
            }
            return;
          }
        );
        return;
      } else if (tab === "WebDAVPage") {
        this.$store.commit("style/showInfo");
        this.$store.commit("currentView/changeView", tab);
        return;
      }
    },
    downloadBackUpOneLineOtpAuthFile() {
      window.open(this.exportOneLineOtpAuthFile);
    },
    downloadBackUpCsvFile() {
      window.open(this.exportCsvFile);
    },
    downloadBackUpExportFile() {
      window.open(this.exportFile);
    },
    downloadBackUpExportEncryptedFile() {
      window.open(this.exportEncryptedFile);
    },
    handleClearAllData() {
      if (!window.confirm(this.i18n.backup_clear_confirm)) {
        return;
      }
      if (window.confirm(this.i18n.backup_clear_backup_prompt)) {
        this.$store.commit("style/showInfo");
        this.$store.commit("currentView/changeView", "WebDAVPage");
        return;
      }
      this.$store
        .dispatch("accounts/clearAllData")
        .then(() => this.$store.dispatch("accounts/updateEntries"))
        .then(() =>
          this.$store.commit(
            "notification/alert",
            this.i18n.backup_clear_success
          )
        );
    },
  },
});

function hasUnsupportedAccounts(exportData: { [h: string]: RawOTPStorage }) {
  for (const entry of Object.keys(exportData)) {
    if (
      exportData[entry].type === "battle" ||
      exportData[entry].type === "steam"
    ) {
      return true;
    }
  }
  return false;
}

function getBackupFile(
  entryData: { [hash: string]: RawOTPStorage },
  key?: Object
) {
  if (key) {
    Object.assign(entryData, { key: key });
  }
  let json = JSON.stringify(entryData, null, 2);
  // for windows notepad
  json = json.replace(/\n/g, "\r\n");
  return downloadFileUrlBuilder(json);
}

function getOneLineOtpBackupFile(entryData: { [hash: string]: RawOTPStorage }) {
  const otpAuthLines: string[] = [];
  for (const hash of Object.keys(entryData)) {
    const otpStorage = entryData[hash];
    if (otpStorage.issuer) {
      otpStorage.issuer = removeUnsafeData(otpStorage.issuer);
    }
    if (otpStorage.account) {
      otpStorage.account = removeUnsafeData(otpStorage.account);
    }
    const label = otpStorage.issuer
      ? otpStorage.issuer + ":" + (otpStorage.account || "")
      : otpStorage.account || "";
    let type = "";
    if (otpStorage.type === "totp" || otpStorage.type === "hex") {
      type = "totp";
    } else if (otpStorage.type === "hotp" || otpStorage.type === "hhex") {
      type = "hotp";
    } else {
      continue;
    }

    const otpAuthLine =
      "otpauth://" +
      type +
      "/" +
      label +
      "?secret=" +
      otpStorage.secret +
      (otpStorage.issuer ? "&issuer=" + otpStorage.issuer : "") +
      (type === "hotp" ? "&counter=" + otpStorage.counter : "") +
      (type === "totp" && otpStorage.period
        ? "&period=" + otpStorage.period
        : "") +
      (otpStorage.digits ? "&digits=" + otpStorage.digits : "") +
      (otpStorage.algorithm ? "&algorithm=" + otpStorage.algorithm : "");

    otpAuthLines.push(otpAuthLine);
  }

  return downloadFileUrlBuilder(otpAuthLines.join("\r\n"));
}

function getCsvBackupFile(entryData: { [hash: string]: RawOTPStorage }) {
  const csvRows: string[] = [];
  // CSV format header with separate secret and issuer columns
  csvRows.push("title,url,username,password,issuer,secret,notes");

  for (const hash of Object.keys(entryData)) {
    const otpStorage = entryData[hash];

    // Skip unsupported types
    let type = "";
    if (otpStorage.type === "totp" || otpStorage.type === "hex") {
      type = "totp";
    } else if (otpStorage.type === "hotp" || otpStorage.type === "hhex") {
      type = "hotp";
    } else {
      continue;
    }

    // Get fields and decode URL encoding
    // For CSV export, decode URL encoding and clean up the data
    const issuer = otpStorage.issuer
      ? decodeUrlEncoding(otpStorage.issuer.split("::")[0].replace(/:/g, ""))
      : "";
    const account = otpStorage.account
      ? decodeUrlEncoding(otpStorage.account.split("::")[0].replace(/:/g, ""))
      : "";
    const secret = otpStorage.secret || "";

    // Build otpauth URL for notes (as backup)
    const label = issuer ? issuer + ":" + (account || "") : account || "";

    const otpAuthUrl =
      "otpauth://" +
      type +
      "/" +
      encodeURIComponent(label) +
      "?secret=" +
      secret +
      (issuer ? "&issuer=" + encodeURIComponent(issuer) : "") +
      (type === "hotp" ? "&counter=" + otpStorage.counter : "") +
      (type === "totp" && otpStorage.period
        ? "&period=" + otpStorage.period
        : "") +
      (otpStorage.digits ? "&digits=" + otpStorage.digits : "") +
      (otpStorage.algorithm ? "&algorithm=" + otpStorage.algorithm : "");

    // CSV fields
    const title = escapeCsvField(issuer || account || "Authenticator Entry");
    const url = "";
    const username = escapeCsvField(account);
    const password = "";
    const issuerField = escapeCsvField(issuer);
    const secretField = escapeCsvField(secret);
    const notes = escapeCsvField(otpAuthUrl);

    csvRows.push(
      `${title},${url},${username},${password},${issuerField},${secretField},${notes}`
    );
  }

  return downloadFileUrlBuilder(csvRows.join("\r\n"));
}

function decodeUrlEncoding(data: string): string {
  try {
    return decodeURIComponent(data);
  } catch (e) {
    // If decoding fails, return original string
    return data;
  }
}

function escapeCsvField(field: string): string {
  if (!field) return "";
  // Escape double quotes and wrap in quotes if contains comma, quote, or newline
  if (
    field.includes('"') ||
    field.includes(",") ||
    field.includes("\n") ||
    field.includes("\r")
  ) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

function downloadFileUrlBuilder(content: string) {
  const blob = new Blob([content], { type: "application/octet-stream" });
  return URL.createObjectURL(blob);
}

function removeUnsafeData(data: string) {
  return encodeURIComponent(data.split("::")[0].replace(/:/g, ""));
}
</script>
