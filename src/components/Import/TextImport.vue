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
    <div
      v-if="showProgress"
      class="import-progress-card"
      :class="{ active: importInProgress }"
    >
      <div class="import-progress-head">
        <span class="import-progress-title">{{
          importInProgress ? "正在导入备份" : "导入进度"
        }}</span>
        <span class="import-progress-value">{{ importProgressValue }}%</span>
      </div>
      <div class="import-progress-bar">
        <div
          class="import-progress-fill"
          :style="{ width: importProgressValue + '%' }"
        ></div>
      </div>
      <div class="import-progress-label">{{ importProgressLabel }}</div>
    </div>
    <div
      v-if="importSummaryMessage"
      :class="['import-result-card', importSummaryTone]"
    >
      <div class="import-result-title">{{ importSummaryTitle }}</div>
      <pre class="import-result-text">{{ importSummaryMessage }}</pre>
    </div>
  </div>
</template>
<script lang="ts">
import * as CryptoJS from "crypto-js";
import Vue from "vue";
import {
  decryptBackupData,
  getEntryDataFromOTPAuthPerLine,
  normalizeImportedEntryGroupIds,
} from "../../import";
import {
  EntryStorage,
  GroupStorage,
  isGroupRecord,
} from "../../models/storage";
import { Encryption } from "../../models/encryption";
import { StorageLocation, UserSettings } from "../../models/settings";

export default Vue.extend({
  data: function () {
    return {
      importCode: "",
      importEncrypted: false,
      importPassphrase: "",
      importSummaryTitle: "",
      importSummaryMessage: "",
      importSummaryTone: "",
      showProgress: false,
      importInProgress: false,
      importProgressValue: 0,
      importProgressLabel: "",
    };
  },
  methods: {
    setProgress(value: number, label: string) {
      this.showProgress = true;
      this.importInProgress = value < 100;
      this.importProgressValue = Math.max(0, Math.min(100, Math.round(value)));
      this.importProgressLabel = label;
    },
    getImportSummary(args: {
      failedCount: number;
      succeededCount: number;
      importedEntryCount: number;
      importedGroupCount: number;
      groupedEntryCount: number;
    }) {
      const title =
        args.failedCount === 0
          ? this.i18n.updateSuccess || "Import complete"
          : args.succeededCount > 0
          ? this.i18n.import_backup_qr_partly_failed ||
            "Import partially completed"
          : this.i18n.updateFailure || "Import failed";

      const lines = [
        title,
        "",
        `导入条目：${args.importedEntryCount}`,
        `导入分组：${args.importedGroupCount}`,
        `带分组条目：${args.groupedEntryCount}`,
      ];

      if (args.failedCount > 0) {
        lines.push(`失败条目：${args.failedCount}`);
      }

      return lines.join("\n");
    },
    async getImportErrorMessage(error: unknown) {
      await UserSettings.updateItems();
      const isSyncStorage =
        UserSettings.items.storageLocation === StorageLocation.Sync;
      const rawMessage =
        error instanceof Error ? error.message : String(error || "");

      if (/QUOTA|MAX_ITEMS|MAX_WRITE|bytes/i.test(rawMessage)) {
        if (isSyncStorage) {
          return [
            "导入失败",
            "",
            "当前正在使用浏览器同步存储，导入数据已超过同步容量限制。",
            "建议到「设置 → 偏好」关闭“浏览器同步”，切换为本地存储后重新导入。",
          ].join("\n");
        }

        return [
          "导入失败",
          "",
          "导入数据已超过浏览器可用存储限制，请减少导入内容后重试。",
        ].join("\n");
      }

      if (rawMessage && rawMessage !== "[object Object]") {
        return `导入失败\n\n原因：${rawMessage}`;
      }

      return this.i18n.updateFailure || "导入失败";
    },
    async importBackupCode() {
      this.importSummaryTitle = "";
      this.importSummaryMessage = "";
      this.importSummaryTone = "";
      this.setProgress(10, "正在解析备份文本");

      let exportData: {
        // @ts-ignore
        key?: { enc: string; hash: string };
        [hash: string]: OTPStorage | Key;
      } = {};
      let failedCount = 0;
      let succeededCount = 0;
      try {
        exportData = JSON.parse(this.importCode);
        this.setProgress(32, "正在整理备份记录");
      } catch (error) {
        console.warn(error);
        // Maybe one-otpauth-per line text
        this.setProgress(32, "正在解析 otpauth 文本");
        const result = await getEntryDataFromOTPAuthPerLine(this.importCode);
        exportData = result.exportData;
        failedCount = result.failedCount;
        succeededCount = result.succeededCount;
      }

      let key: { enc: string; hash: string } | null = null;
      const groups: { [id: string]: GroupStorageRecord } = {};

      if (exportData.hasOwnProperty("key")) {
        if (exportData.key) {
          key = exportData.key;
        }
        delete exportData.key;
      }

      for (const recordId of Object.keys(exportData)) {
        const possibleGroup = exportData[recordId];
        if (isGroupRecord(possibleGroup)) {
          groups[recordId] = possibleGroup;
          delete exportData[recordId];
        }
      }

      try {
        const passphrase: string | null =
          this.importEncrypted && this.importPassphrase
            ? this.importPassphrase
            : null;
        this.setProgress(
          52,
          passphrase ? "正在解密备份内容" : "正在准备导入内容"
        );
        let decryptedbackupData: {
          [hash: string]: RawOTPStorage;
        } = {};
        if (key && passphrase) {
          decryptedbackupData = await decryptBackupData(
            exportData,
            CryptoJS.AES.decrypt(key.enc, passphrase).toString()
          );
        } else {
          decryptedbackupData = await decryptBackupData(exportData, passphrase);
        }

        if (Object.keys(decryptedbackupData).length) {
          if (Object.keys(groups).length) {
            this.setProgress(70, "正在导入分组");
            await GroupStorage.import(groups);
          }
          const availableGroups = await GroupStorage.get();
          normalizeImportedEntryGroupIds(decryptedbackupData, availableGroups);

          const importedEntryCount = Object.keys(decryptedbackupData).length;
          const importedGroupCount = Object.keys(groups).length;
          const groupedEntryCount = Object.values(
            decryptedbackupData
          ).filter((entry) => Boolean(entry.groupId)).length;
          this.setProgress(82, "正在导入 OTP 条目");
          await EntryStorage.import(
            this.$encryption as Encryption,
            decryptedbackupData
          );

          if (this.$store) {
            this.setProgress(93, "正在刷新列表");
            await this.$store.dispatch("groups/refreshGroups");
            await this.$store.dispatch("accounts/updateEntries");
          }

          this.importSummaryTitle =
            failedCount === 0
              ? "导入完成"
              : succeededCount > 0
              ? "部分导入成功"
              : "导入失败";
          this.importSummaryTone =
            failedCount === 0
              ? "success"
              : succeededCount > 0
              ? "warning"
              : "error";
          this.importSummaryMessage = this.getImportSummary({
            failedCount,
            succeededCount,
            importedEntryCount,
            importedGroupCount,
            groupedEntryCount,
          });
          this.setProgress(100, "导入完成");
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          });
        } else {
          this.importSummaryTitle = "导入失败";
          this.importSummaryTone = "error";
          this.importSummaryMessage = this.i18n.updateFailure || "导入失败";
          this.setProgress(100, "未识别到可导入内容");
        }
        return;
      } catch (error) {
        console.error(error);
        this.importSummaryTitle = "导入失败";
        this.importSummaryTone = "error";
        this.importSummaryMessage = await this.getImportErrorMessage(error);
        this.setProgress(100, "导入过程中出现错误");
        return;
      }
    },
  },
});
</script>
