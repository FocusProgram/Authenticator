<template>
  <div>
    <div class="backup-export-panel">
      <div class="backup-export-title">导出备份</div>
      <div class="backup-export-desc">
        {{ i18n.backup_file_info }}
      </div>

      <div class="control-group">
        <label class="combo-label">导出格式</label>
        <select v-model="exportFormat" @change="handleFormatChange">
          <option value="json">JSON（完整备份）</option>
          <option value="txt">TXT（兼容文本）</option>
          <option value="csv">CSV（表格）</option>
        </select>
      </div>

      <div class="control-group">
        <label class="combo-label">加密导出</label>
        <input
          type="checkbox"
          v-model="exportEncrypted"
          :disabled="!canEncrypt"
        />
      </div>

      <div class="backup-export-summary">
        {{ exportSummaryText }}
      </div>

      <div class="text warning" v-if="!defaultEncryption">
        {{ i18n.export_info }}
      </div>
      <div class="text warning" v-if="showUnsupportedFormatWarning">
        {{ i18n.otp_unsupported_warn }}
      </div>
      <div class="text warning" v-if="currentlyEncrypted">
        {{ i18n.phrase_incorrect_export }}
      </div>

      <button class="button" @click="exportBackup">导出备份</button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isSafari } from "../../browser";
import { EntryStorage } from "../../models/storage";

export default Vue.extend({
  data() {
    return {
      exportFormat: "json",
      exportEncrypted: false,
    };
  },
  computed: {
    exportData(): { [h: string]: RawOTPStorage } {
      const entries = this.$store.getters["accounts/entries"];
      const result = EntryStorage.getExport(entries);
      return (typeof result === "object" && result !== null ? result : {}) as {
        [h: string]: RawOTPStorage;
      };
    },
    exportEncData(): { [h: string]: RawOTPStorage | Key } {
      return this.$store.state.accounts.exportEncData || {};
    },
    groupsExportData(): { [id: string]: GroupStorageRecord } {
      return this.$store.state.groups.groups.reduce(
        (
          acc: { [id: string]: GroupStorageRecord },
          group: OTPGroupInterface
        ) => {
          acc[group.id] = {
            dataType: "Group",
            id: group.id,
            name: group.name,
            index: group.index,
          };
          return acc;
        },
        {}
      );
    },
    unsupportedAccounts(): boolean {
      return hasUnsupportedAccounts(this.exportData);
    },
    exportFile(): string {
      return getBackupFile({ ...this.exportData, ...this.groupsExportData });
    },
    exportEncryptedFile(): string {
      return getBackupFile({
        ...this.exportEncData,
        ...this.groupsExportData,
      });
    },
    exportOneLineOtpAuthFile(): string {
      return getOneLineOtpBackupFile(this.exportData);
    },
    exportCsvFile(): string {
      return getCsvBackupFile(this.exportData, this.$store.state.groups.groups);
    },
    defaultEncryption(): string {
      return this.$store.state.accounts.defaultEncryption;
    },
    currentlyEncrypted(): boolean {
      return this.$store.getters["accounts/currentlyEncrypted"];
    },
    isDataLinkSupported(): boolean {
      return !isSafari;
    },
    canEncrypt(): boolean {
      return this.exportFormat === "json" && Boolean(this.defaultEncryption);
    },
    showUnsupportedFormatWarning(): boolean {
      return (
        this.unsupportedAccounts &&
        (this.exportFormat === "txt" || this.exportFormat === "csv")
      );
    },
    exportSummaryText(): string {
      if (this.exportFormat === "json") {
        return this.exportEncrypted
          ? "导出为加密 JSON，适合完整备份与恢复。"
          : "导出为 JSON，包含 OTP、备注和分组信息。";
      }

      if (this.exportFormat === "txt") {
        return "导出为 otpauth 文本，适合导入其他验证器。";
      }

      return "导出为 CSV，适合表格查看、筛选和归档。";
    },
  },
  methods: {
    handleFormatChange() {
      if (this.exportFormat !== "json") {
        this.exportEncrypted = false;
      }
    },
    exportBackup() {
      const exportMap: Record<string, { url: string; filename: string }> = {
        json: {
          url: this.exportEncrypted
            ? this.exportEncryptedFile
            : this.exportFile,
          filename: this.exportEncrypted
            ? "authenticator-encrypted.json"
            : "authenticator.json",
        },
        txt: {
          url: this.exportOneLineOtpAuthFile,
          filename: "authenticator.txt",
        },
        csv: {
          url: this.exportCsvFile,
          filename: "authenticator.csv",
        },
      };

      const current = exportMap[this.exportFormat];
      if (!current) {
        return;
      }

      if (!this.isDataLinkSupported) {
        window.open(current.url);
        return;
      }

      const link = document.createElement("a");
      link.href = current.url;
      link.download = current.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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

function getBackupFile(entryData: {
  [hash: string]: RawOTPStorage | GroupStorageRecord | Key;
}) {
  let json = JSON.stringify(entryData, null, 2);
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

function getCsvBackupFile(
  entryData: { [hash: string]: RawOTPStorage },
  groups: OTPGroupInterface[]
) {
  const csvRows: string[] = [];
  csvRows.push("title,url,username,password,issuer,group,secret,notes");

  for (const hash of Object.keys(entryData)) {
    const otpStorage = entryData[hash];

    let type = "";
    if (otpStorage.type === "totp" || otpStorage.type === "hex") {
      type = "totp";
    } else if (otpStorage.type === "hotp" || otpStorage.type === "hhex") {
      type = "hotp";
    } else {
      continue;
    }

    const issuer = otpStorage.issuer
      ? decodeUrlEncoding(otpStorage.issuer.split("::")[0].replace(/:/g, ""))
      : "";
    const account = otpStorage.account
      ? decodeUrlEncoding(otpStorage.account.split("::")[0].replace(/:/g, ""))
      : "";
    const secret = otpStorage.secret || "";
    const groupName =
      groups.find((group) => group.id === otpStorage.groupId)?.name || "";
    const note = otpStorage.note || "";
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

    const title = escapeCsvField(issuer || account || "Authenticator Entry");
    const url = "";
    const username = escapeCsvField(account);
    const password = "";
    const issuerField = escapeCsvField(issuer);
    const groupField = escapeCsvField(groupName);
    const secretField = escapeCsvField(secret);
    const notes = escapeCsvField([note, otpAuthUrl].filter(Boolean).join("\n"));

    csvRows.push(
      `${title},${url},${username},${password},${issuerField},${groupField},${secretField},${notes}`
    );
  }

  return downloadFileUrlBuilder(csvRows.join("\r\n"));
}

function decodeUrlEncoding(data: string) {
  try {
    return decodeURIComponent(data);
  } catch {
    return data;
  }
}

function escapeCsvField(field: string) {
  if (!field) return "";
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
