<template>
  <div class="subpage export-backup-page">
    <div class="subpage-head" v-if="!embedded">
      <div class="subpage-title">{{ i18n.ui_export_backup }}</div>
      <div class="subpage-subtitle">
        {{ i18n.ui_export_subtitle }}
      </div>
    </div>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_export_options }}</div>
      </div>
      <div class="subpage-list-card">
        <label class="subpage-row export-format-row">
          <span class="subpage-row-title">{{ i18n.ui_export_format }}</span>
          <span class="subpage-control">
            <select
              class="subpage-select export-format-select"
              v-model="exportFormat"
              @change="handleFormatChange"
            >
              <option value="json">{{ i18n.ui_json_full_backup }}</option>
              <option value="txt">{{ i18n.ui_txt_standard_links }}</option>
              <option value="csv">{{ i18n.ui_csv_table_data }}</option>
            </select>
          </span>
        </label>

        <label class="subpage-row">
          <span :class="['subpage-row-icon', canEncrypt ? '' : 'neutral']">
            <IconLock />
          </span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">{{ i18n.ui_encrypt_master }}</span>
            <span class="subpage-row-desc">
              {{ encryptionOptionDescription }}
            </span>
          </span>
          <span class="subpage-switch">
            <input
              type="checkbox"
              v-model="exportEncrypted"
              :disabled="!canEncrypt"
            />
            <span class="subpage-switch-track"></span>
          </span>
        </label>
      </div>
    </section>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_this_export }}</div>
      </div>
      <div class="subpage-notice export-summary-card">
        <span class="subpage-row-icon"><IconInfo /></span>
        <div>
          <div class="subpage-notice-title">{{ exportFormatTitle }}</div>
          <div class="subpage-notice-desc">{{ exportSummaryText }}</div>
          <div class="export-summary-meta">
            <span>{{ exportEntryCount }} {{ i18n.ui_code_count }}</span>
            <span v-if="exportFormat === 'json'">
              {{ groups.length }} {{ i18n.ui_group_count }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <section
      class="subpage-section"
      v-if="
        !defaultEncryption || showUnsupportedFormatWarning || currentlyEncrypted
      "
    >
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_export_tips }}</div>
      </div>
      <div class="export-warning-list">
        <div class="subpage-notice" v-if="!defaultEncryption">
          <span class="subpage-row-icon warning"><IconAdvisor /></span>
          <div>
            <div class="subpage-notice-title">
              {{ i18n.ui_no_master_password }}
            </div>
            <div class="subpage-notice-desc">
              {{ i18n.ui_no_master_password_desc }}
            </div>
          </div>
        </div>

        <div class="subpage-notice" v-if="showUnsupportedFormatWarning">
          <span class="subpage-row-icon warning"><IconAdvisor /></span>
          <div>
            <div class="subpage-notice-title">
              {{ i18n.ui_unsupported_format }}
            </div>
            <div class="subpage-notice-desc">
              {{
                i18n.otp_unsupported_warn ||
                "Steam and Battle.net accounts are not included in TXT or CSV backups."
              }}
            </div>
          </div>
        </div>

        <div class="subpage-notice" v-if="currentlyEncrypted">
          <span class="subpage-row-icon danger"><IconXCircle /></span>
          <div>
            <div class="subpage-notice-title">
              {{ i18n.ui_locked_accounts }}
            </div>
            <div class="subpage-notice-desc">
              {{
                i18n.phrase_incorrect_export ||
                "Accounts that cannot be decrypted are not included in this backup."
              }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="subpage-actions export-backup-actions">
      <button
        type="button"
        class="subpage-button primary"
        :disabled="isExporting"
        @click="exportBackup"
      >
        {{ isExporting ? i18n.ui_exporting : exportButtonLabel }}
      </button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isSafari } from "../../browser";
import { Encryption } from "../../models/encryption";
import { EntryStorage } from "../../models/storage";
import IconAdvisor from "../../../svg/lightbulb.svg";
import IconInfo from "../../../svg/info.svg";
import IconLock from "../../../svg/lock.svg";
import IconXCircle from "../../../svg/x-circle.svg";
import {
  buildBackupJson,
  buildCsvBackup,
  buildOtpAuthText,
  getGroupExportData,
  hasUnsupportedAccounts,
} from "../../models/export-utils";

export default Vue.extend({
  props: {
    embedded: {
      type: Boolean,
      default: false,
    },
  },
  components: {
    IconAdvisor,
    IconInfo,
    IconLock,
    IconXCircle,
  },
  data() {
    return {
      exportFormat: "json",
      exportEncrypted: false,
      isExporting: false,
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
    groups(): OTPGroupInterface[] {
      return this.$store.state.groups.groups;
    },
    unsupportedAccounts(): boolean {
      return hasUnsupportedAccounts(this.exportData);
    },
    defaultEncryption(): string {
      return this.$store.state.accounts.defaultEncryption;
    },
    activeEncryption(): EncryptionInterface | null {
      if (!this.defaultEncryption) {
        return null;
      }
      const encryption = this.$store.state.accounts.encryption as Map<
        string,
        EncryptionInterface
      >;
      return encryption.get(this.defaultEncryption) || null;
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
    exportEntryCount(): number {
      return Object.keys(this.exportData).length;
    },
    encryptionOptionDescription(): string {
      if (this.exportFormat !== "json") {
        return this.i18n.ui_txt_csv_no_encryption;
      }
      if (!this.defaultEncryption) {
        return this.i18n.ui_create_password_first;
      }
      return this.i18n.ui_json_encryption_only;
    },
    exportFormatTitle(): string {
      if (this.exportFormat === "json") {
        return this.exportEncrypted
          ? this.i18n.ui_encrypted_json_backup
          : this.i18n.ui_json_backup;
      }
      if (this.exportFormat === "txt") {
        return this.i18n.ui_txt_backup;
      }
      return this.i18n.ui_csv_backup;
    },
    exportButtonLabel(): string {
      return `${
        this.i18n.ui_export_prefix
      } ${this.exportFormat.toUpperCase()} ${this.i18n.ui_backup_title}`;
    },
    exportSummaryText(): string {
      if (this.exportFormat === "json") {
        return this.exportEncrypted
          ? this.i18n.ui_json_encrypted_summary
          : this.i18n.ui_json_summary;
      }

      if (this.exportFormat === "txt") {
        return this.i18n.ui_txt_summary;
      }

      return this.i18n.ui_csv_summary;
    },
  },
  methods: {
    handleFormatChange() {
      if (this.exportFormat !== "json") {
        this.exportEncrypted = false;
      }
    },
    async exportBackup() {
      if (this.isExporting) {
        return;
      }
      this.isExporting = true;
      try {
        const exportFile = await this.getExportFile();
        if (!exportFile) {
          return;
        }

        const blob = new Blob([exportFile.content], {
          type: exportFile.mimeType,
        });
        const url = URL.createObjectURL(blob);

        if (!this.isDataLinkSupported) {
          window.open(url);
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          return;
        }

        const link = document.createElement("a");
        link.href = url;
        link.download = exportFile.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } finally {
        this.isExporting = false;
      }
    },
    async getExportFile(): Promise<{
      content: string;
      filename: string;
      mimeType: string;
    } | null> {
      if (this.exportFormat === "json") {
        if (this.exportEncrypted) {
          if (!this.activeEncryption?.getEncryptionStatus()) {
            this.$store.commit(
              "notification/alert",
              this.i18n.ui_unlock_before_encrypted_export
            );
            return null;
          }
          const encryptedData = await EntryStorage.backupGetExport(
            this.activeEncryption as Encryption,
            true
          );
          return {
            content: buildBackupJson(encryptedData),
            filename: "authenticator-encrypted.json",
            mimeType: "application/json;charset=utf-8",
          };
        }

        return {
          content: buildBackupJson({
            ...this.exportData,
            ...getGroupExportData(this.groups),
          }),
          filename: "authenticator.json",
          mimeType: "application/json;charset=utf-8",
        };
      }

      if (this.exportFormat === "txt") {
        return {
          content: buildOtpAuthText(this.exportData),
          filename: "authenticator.txt",
          mimeType: "text/plain;charset=utf-8",
        };
      }

      if (this.exportFormat === "csv") {
        return {
          content: "\uFEFF" + buildCsvBackup(this.exportData, this.groups),
          filename: "authenticator.csv",
          mimeType: "text/csv;charset=utf-8",
        };
      }

      return null;
    },
  },
});
</script>
