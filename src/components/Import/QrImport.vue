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
    <div
      v-if="showProgress"
      class="import-progress-card"
      :class="{ active: importInProgress }"
    >
      <div class="import-progress-head">
        <span class="import-progress-title">{{
          importInProgress ? "正在导入二维码备份" : "导入进度"
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
import Vue from "vue";
// @ts-ignore
import QRCode from "qrcode-reader";
import jsQR from "jsqr";
import { getEntryDataFromOTPAuthPerLine } from "../../import";
import { EntryStorage } from "../../models/storage";
import { Encryption } from "../../models/encryption";
import { StorageLocation, UserSettings } from "../../models/settings";

export default Vue.extend({
  data() {
    return {
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
      scannedCount: number;
      decodedCount: number;
      imageFailedCount: number;
    }) {
      const title =
        args.failedCount === 0 && args.imageFailedCount === 0
          ? this.i18n.updateSuccess || "Import complete"
          : args.succeededCount > 0 || args.decodedCount > 0
          ? this.i18n.migration_partly_fail || "Import partially completed"
          : this.i18n.migration_fail || "Import failed";

      const lines = [
        title,
        "",
        `扫描图片：${args.scannedCount}`,
        `识别成功：${args.decodedCount}`,
        `导入条目：${args.succeededCount}`,
      ];

      if (args.imageFailedCount > 0) {
        lines.push(`识别失败：${args.imageFailedCount}`);
      }

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

      return this.i18n.migration_fail || "导入失败";
    },
    async importQr(event: Event, closeWindow: Boolean) {
      this.importSummaryTitle = "";
      this.importSummaryMessage = "";
      this.importSummaryTone = "";
      this.setProgress(8, "等待读取二维码图片");

      const target = event.target as HTMLInputElement;
      if (!target || !target.files) {
        return;
      }
      if (target.files.length) {
        try {
          const otpUrlList: string[] = [];
          let imageFailedCount = 0;
          const scannedCount = target.files.length;

          for (
            let fileIndex = 0;
            fileIndex < target.files.length;
            fileIndex++
          ) {
            const file = target.files[fileIndex];
            this.setProgress(
              12 + ((fileIndex + 1) / scannedCount) * 48,
              `正在识别二维码（${fileIndex + 1}/${scannedCount}）`
            );
            const otpUrl = await getOtpUrlFromQrFile(file);
            if (otpUrl !== null) {
              otpUrlList.push(otpUrl);
            } else {
              imageFailedCount++;
            }
          }

          this.setProgress(66, "正在解析 OTP 数据");
          const result = await getEntryDataFromOTPAuthPerLine(
            otpUrlList.join("\n")
          );

          let importData: {
            // @ts-ignore
            key?: { enc: string; hash: string };
            [hash: string]: RawOTPStorage;
          } = result.exportData;

          const { failedCount, succeededCount } = result;

          const decryptedFileData: {
            [hash: string]: RawOTPStorage;
          } = importData;

          if (Object.keys(decryptedFileData).length) {
            this.setProgress(84, "正在导入 OTP 条目");
            await EntryStorage.import(
              this.$encryption as Encryption,
              decryptedFileData
            );

            this.importSummaryTitle =
              failedCount === 0 && imageFailedCount === 0
                ? "导入完成"
                : succeededCount > 0 || otpUrlList.length > 0
                ? "部分导入成功"
                : "导入失败";
            this.importSummaryTone =
              failedCount === 0 && imageFailedCount === 0
                ? "success"
                : succeededCount > 0 || otpUrlList.length > 0
                ? "warning"
                : "error";
            this.importSummaryMessage = this.getImportSummary({
              failedCount,
              succeededCount,
              scannedCount,
              decodedCount: otpUrlList.length,
              imageFailedCount,
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
              this.i18n.errorqr || "未识别到可导入二维码";
            this.setProgress(100, "未识别到可导入内容");
          }
        } catch (error) {
          console.error(error);
          this.importSummaryTitle = "导入失败";
          this.importSummaryTone = "error";
          this.importSummaryMessage = await this.getImportErrorMessage(error);
          this.setProgress(100, "导入过程中出现错误");
        }
      } else {
        this.importSummaryTitle = "导入失败";
        this.importSummaryTone = "error";
        this.importSummaryMessage = this.i18n.updateFailure || "导入失败";
        this.setProgress(100, "未选择图片");
        if (closeWindow) {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          });
        }
      }
      return;
    },
  },
});

async function getOtpUrlFromQrFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = reader.result as string;
      const qrReader = new QRCode();
      qrReader.callback = (
        error: string,
        text: {
          result: string;
          points: Array<{
            x: number;
            y: number;
            count: number;
            estimatedModuleSize: number;
          }>;
        }
      ) => {
        if (error) {
          console.error(error);

          const image: HTMLImageElement = document.createElement("img");
          image.onload = () => {
            const canvas: HTMLCanvasElement = document.createElement("canvas");
            const ctx: CanvasRenderingContext2D = canvas.getContext(
              "2d"
            ) as CanvasRenderingContext2D;

            canvas.width = image.width;
            canvas.height = image.height;
            ctx.drawImage(image, 0, 0);

            const qrImageData = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );
            const jsQrCode = jsQR(
              qrImageData.data,
              canvas.width,
              canvas.height
            );

            if (jsQrCode && jsQrCode.data) {
              if (
                jsQrCode.data.indexOf("otpauth://") !== 0 &&
                jsQrCode.data.indexOf("otpauth-migration://") !== 0
              ) {
                return resolve(null);
              }
              return resolve(jsQrCode.data);
            } else {
              return resolve(null);
            }
          };
          image.src = imageUrl;
        } else {
          if (
            text.result.indexOf("otpauth://") !== 0 &&
            text.result.indexOf("otpauth-migration://") !== 0
          ) {
            return resolve(null);
          }
          return resolve(text.result);
        }
      };
      qrReader.decode(imageUrl);
    };
    reader.readAsDataURL(file);
  });
}
</script>
