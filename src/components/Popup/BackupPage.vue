<template>
  <div class="backup-page">
    <div class="backup-page-head">
      <div class="backup-page-subtitle">
        {{ i18n.ui_backup_subtitle }}
      </div>
    </div>

    <section class="backup-section">
      <div class="backup-section-title">{{ i18n.ui_local_backup }}</div>
      <div class="backup-option-list">
        <button
          v-if="!exportDisabled"
          type="button"
          class="backup-option"
          @click="showInfo('ExportBackupPage')"
        >
          <span class="backup-option-icon"><IconExchange /></span>
          <span class="backup-option-copy">
            <span class="backup-option-title">{{ i18n.ui_export_backup }}</span>
            <span class="backup-option-desc">{{
              i18n.ui_export_backup_desc
            }}</span>
          </span>
          <IconArrowLeft class="backup-option-arrow" />
        </button>

        <a
          class="backup-option"
          href="import.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="backup-option-icon"><IconRedo /></span>
          <span class="backup-option-copy">
            <span class="backup-option-title">
              {{ i18n.import_backup || "Import backup" }}
            </span>
            <span class="backup-option-desc">{{
              i18n.ui_import_backup_desc
            }}</span>
          </span>
          <IconArrowLeft class="backup-option-arrow" />
        </a>
      </div>
    </section>

    <section
      class="backup-section"
      v-if="!backupDisabled && isBackupServiceSupported"
    >
      <div class="backup-section-title">{{ i18n.ui_automatic_backup }}</div>
      <div class="backup-section-desc">{{ i18n.storage_sync_info }}</div>
      <div class="backup-option-list">
        <button
          type="button"
          class="backup-option"
          @click="showInfo('WebDAVPage')"
        >
          <span class="backup-option-icon"><IconSync /></span>
          <span class="backup-option-copy">
            <span class="backup-option-title">WebDAV</span>
            <span class="backup-option-desc">{{ i18n.ui_webdav_desc }}</span>
          </span>
          <IconArrowLeft class="backup-option-arrow" />
        </button>
      </div>
    </section>

    <section class="backup-section">
      <div class="backup-section-title">{{ i18n.ui_data_management }}</div>
      <div class="backup-option-list">
        <button
          type="button"
          class="backup-option danger"
          @click="handleClearAllData"
        >
          <span class="backup-option-icon"><IconXCircle /></span>
          <span class="backup-option-copy">
            <span class="backup-option-title">
              {{ i18n.backup_clear_button || "Clear all data" }}
            </span>
            <span class="backup-option-desc">{{
              i18n.ui_clear_data_desc
            }}</span>
          </span>
          <IconArrowLeft class="backup-option-arrow" />
        </button>
      </div>
    </section>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isSafari } from "../../browser";
import IconArrowLeft from "../../../svg/arrow-left.svg";
import IconExchange from "../../../svg/exchange.svg";
import IconRedo from "../../../svg/redo.svg";
import IconSync from "../../../svg/sync.svg";
import IconXCircle from "../../../svg/x-circle.svg";

export default Vue.extend({
  components: {
    IconArrowLeft,
    IconExchange,
    IconRedo,
    IconSync,
    IconXCircle,
  },
  computed: {
    exportDisabled(): boolean {
      return this.$store.state.menu.exportDisabled;
    },
    backupDisabled(): boolean {
      return this.$store.state.menu.backupDisabled;
    },
    isBackupServiceSupported(): boolean {
      return !isSafari;
    },
  },
  methods: {
    showInfo(tab: string) {
      if (tab === "ExportBackupPage" || tab === "WebDAVPage") {
        this.$emit("navigate", tab);
        return;
      }
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
      if (
        await this.$store.dispatch(
          "notification/confirm",
          this.i18n.backup_clear_backup_prompt
        )
      ) {
        this.$emit("navigate", "WebDAVPage");
        return;
      }
      await this.$store.dispatch("accounts/clearAllData");
      await this.$store.dispatch("accounts/updateEntries");
      this.$store.commit("notification/alert", this.i18n.backup_clear_success);
    },
  },
});
</script>
