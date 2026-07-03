<template>
  <div>
    <div v-if="!getFilePassphrase">
      <a-file-input
        button-type="file"
        accept="application/json, text/plain"
        @change="importFile($event, true)"
        :label="i18n.import_backup_file"
      />
      <div class="import-inline-option">
        <input
          type="checkbox"
          id="clearBeforeImport"
          v-model="clearBeforeImport"
        />
        <label for="clearBeforeImport">导入前清空现有数据</label>
      </div>
    </div>
    <div class="import_file_passphrase" v-else>
      <p class="error_password">{{ i18n.passphrase_info }}</p>
      <a-text-input
        :label="i18n.phrase"
        type="password"
        @enter="readFilePassphrase = true"
        v-model="importFilePassphrase"
      />
      <a-button @click="readFilePassphrase = true">{{ i18n.ok }}</a-button>
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
  getEntryDataFromBitwarden,
  normalizeImportedEntryGroupIds,
} from "../../import";
import {
  BrowserStorage,
  EntryStorage,
  GroupStorage,
  isGroupRecord,
} from "../../models/storage";
import { Encryption } from "../../models/encryption";
import { StorageLocation, UserSettings } from "../../models/settings";

export default Vue.extend({
  data: function () {
    return {
      getFilePassphrase: false,
      readFilePassphrase: false,
      importFilePassphrase: "",
      importSummaryTitle: "",
      importSummaryMessage: "",
      importSummaryTone: "",
      showProgress: false,
      importInProgress: false,
      importProgressValue: 0,
      importProgressLabel: "",
      clearBeforeImport: false,
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
      clearedEntryCount?: number;
      clearedGroupCount?: number;
    }) {
      const title =
        args.failedCount === 0
          ? this.i18n.updateSuccess || "Import complete"
          : args.succeededCount > 0
          ? this.i18n.migration_partly_fail || "Import partially completed"
          : this.i18n.migration_fail || "Import failed";

      const lines = [
        title,
        "",
        `导入条目：${args.importedEntryCount}`,
        `导入分组：${args.importedGroupCount}`,
        `带分组条目：${args.groupedEntryCount}`,
      ];

      if (
        typeof args.clearedEntryCount === "number" ||
        typeof args.clearedGroupCount === "number"
      ) {
        lines.push(
          `清空历史 OTP：${args.clearedEntryCount || 0}`,
          `清空历史分组：${args.clearedGroupCount || 0}`
        );
      }

      if (args.failedCount > 0) {
        lines.push(`失败条目：${args.failedCount}`);
      }

      return lines.join("\n");
    },
    async clearExistingImportData() {
      const existingEntries = await EntryStorage.get();
      const existingGroups = await GroupStorage.get();
      const removableKeys = [
        ...existingEntries.map((entry) => entry.hash),
        ...existingGroups.map((group) => group.id),
      ];

      if (removableKeys.length) {
        await BrowserStorage.remove(removableKeys);
      }

      return {
        clearedEntryCount: existingEntries.length,
        clearedGroupCount: existingGroups.length,
      };
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

      return this.i18n.migration_fail || "导入失败";
    },
    importFile(event: Event, closeWindow: Boolean) {
      this.importSummaryTitle = "";
      this.importSummaryMessage = "";
      this.importSummaryTone = "";
      this.setProgress(4, "已选择文件，准备读取");

      const target = event.target as HTMLInputElement;
      if (!target || !target.files) {
        return;
      }
      if (target.files[0]) {
        const reader = new FileReader();
        let decryptedFileData: { [hash: string]: RawOTPStorage } = {};
        let importedGroups: { [id: string]: GroupStorageRecord } = {};
        reader.onloadstart = () => {
          this.setProgress(10, "正在读取备份文件");
        };
        reader.onprogress = (progressEvent: ProgressEvent<FileReader>) => {
          if (progressEvent.lengthComputable) {
            const ratio =
              progressEvent.total > 0
                ? progressEvent.loaded / progressEvent.total
                : 0;
            this.setProgress(10 + ratio * 24, "正在读取备份文件");
          }
        };
        reader.onload = async () => {
          try {
            this.setProgress(38, "正在解析备份内容");
            let importData: {
              // @ts-ignore
              key?: { enc: string; hash: string };
              [hash: string]: RawOTPStorage | Key;
              // Bug #557, uploaded backups were missing `key`
              // @ts-ignore
              enc?: string;
              // @ts-ignore
              hash?: string;
            } = {};
            let failedCount = 0;
            let succeededCount = 0;
            try {
              const parsed = JSON.parse(reader.result as string);
              // Detect Bitwarden export format
              if (Array.isArray(parsed.items)) {
                this.setProgress(46, "正在解析 Bitwarden 备份");
                const result = await getEntryDataFromBitwarden(parsed);
                importData = result.exportData;
                importedGroups = result.groups;
                failedCount = result.failedCount;
                succeededCount = result.succeededCount;
              } else {
                this.setProgress(46, "正在整理备份记录");
                importData = parsed;

                for (const recordId of Object.keys(importData)) {
                  const possibleGroup = importData[recordId];
                  if (isGroupRecord(possibleGroup)) {
                    importedGroups[recordId] = possibleGroup;
                    delete importData[recordId];
                  }
                }

                succeededCount = Object.keys(importData).filter(
                  (key) => ["key", "enc", "hash"].indexOf(key) === -1
                ).length;
              }
            } catch (e) {
              console.warn(e);
              this.setProgress(46, "正在解析文本备份");
              const result = await getEntryDataFromOTPAuthPerLine(
                reader.result as string
              );
              importData = result.exportData;
              failedCount = result.failedCount;
              succeededCount = result.succeededCount;
            }

            let key: { enc: string } | null = null;

            if (importData.hasOwnProperty("key")) {
              if (importData.key) {
                key = importData.key;
              }
              delete importData.key;
            } else if (importData.enc && importData.hash) {
              key = { enc: importData.enc };
              delete importData.hash;
              delete importData.enc;
            }

            for (const hash in importData) {
              const possibleEntry = importData[hash];
              if (possibleEntry.dataType === "Key") {
                // don't try to import keys as an OTPEntry
                continue;
              }

              if (possibleEntry.keyId || possibleEntry.encrypted) {
                try {
                  this.setProgress(58, "正在解密备份内容");
                  const oldPassphrase:
                    | string
                    | null = await this.getOldPassphrase();

                  if (key) {
                    // v2 encryption
                    decryptedFileData = await decryptBackupData(
                      importData,
                      CryptoJS.AES.decrypt(key.enc, oldPassphrase).toString()
                    );
                  } else {
                    // v3 and v1 encryption
                    decryptedFileData = await decryptBackupData(
                      importData,
                      oldPassphrase
                    );
                  }

                  break;
                } catch {
                  this.setProgress(100, "解密失败");
                  break;
                }
              } else {
                decryptedFileData[hash] = possibleEntry;
              }
            }

            if (Object.keys(decryptedFileData).length) {
              let clearedEntryCount: number | undefined;
              let clearedGroupCount: number | undefined;

              if (this.clearBeforeImport) {
                this.setProgress(68, "正在清空现有数据");
                const clearedCounts = await this.clearExistingImportData();
                clearedEntryCount = clearedCounts.clearedEntryCount;
                clearedGroupCount = clearedCounts.clearedGroupCount;
              }

              if (Object.keys(importedGroups).length) {
                this.setProgress(74, "正在导入分组");
                await GroupStorage.import(importedGroups);
              }
              const availableGroups = await GroupStorage.get();
              normalizeImportedEntryGroupIds(
                decryptedFileData,
                availableGroups
              );

              const importedEntryCount = Object.keys(decryptedFileData).length;
              const importedGroupCount = Object.keys(importedGroups).length;
              const groupedEntryCount = Object.values(
                decryptedFileData
              ).filter((entry) => Boolean(entry.groupId)).length;
              this.setProgress(84, "正在导入 OTP 条目");
              await EntryStorage.import(
                this.$encryption as Encryption,
                decryptedFileData
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
                clearedEntryCount,
                clearedGroupCount,
              });
              this.setProgress(100, "导入完成");

              if (closeWindow) {
                window.scrollTo({
                  top: document.body.scrollHeight,
                  behavior: "smooth",
                });
              }
            } else {
              this.importSummaryTitle = "导入失败";
              this.importSummaryTone = "error";
              this.importSummaryMessage =
                this.i18n.migration_fail || "导入失败";
              this.setProgress(100, "未识别到可导入内容");
              this.getFilePassphrase = false;
              this.importFilePassphrase = "";
            }
          } catch (error) {
            console.error(error);
            this.importSummaryTitle = "导入失败";
            this.importSummaryTone = "error";
            this.importSummaryMessage = await this.getImportErrorMessage(error);
            this.setProgress(100, "导入过程中出现错误");
          }
        };
        reader.readAsText(target.files[0], "utf8");
      } else {
        this.importSummaryTitle = "导入失败";
        this.importSummaryTone = "error";
        this.importSummaryMessage = this.i18n.migration_fail || "导入失败";
        this.setProgress(100, "未选择文件");
        if (closeWindow) {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          });
        }
      }
      return;
    },
    async getOldPassphrase() {
      this.getFilePassphrase = true;
      this.setProgress(58, "等待输入备份密码");
      while (true) {
        if (this.readFilePassphrase) {
          if (this.importFilePassphrase) {
            this.readFilePassphrase = false;
            break;
          } else {
            this.readFilePassphrase = false;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return this.importFilePassphrase;
    },
  },
});
</script>
