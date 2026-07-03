<template>
  <div>
    <div class="backup-action-row" v-show="!exportDisabled">
      <a-button @click="showInfo('ExportBackupPage')">导出备份</a-button>
    </div>
    <div class="backup-action-row">
      <a-button-link href="import.html">{{ i18n.import_backup }}</a-button-link>
    </div>
    <br />
    <div v-show="!backupDisabled && isBackupServiceSupported">
      <div class="text">
        {{ i18n.storage_sync_info }}
      </div>
      <p></p>
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

export default Vue.extend({
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
        this.$store.commit("style/showInfo");
        this.$store.commit("currentView/changeView", tab);
        return;
      }
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
</script>
