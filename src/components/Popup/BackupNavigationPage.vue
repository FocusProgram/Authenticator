<template>
  <div class="backup-navigation-shell">
    <div class="header">
      <div class="header-actions header-actions-left">
        <button
          type="button"
          class="header-icon"
          :title="i18n.back"
          :aria-label="i18n.back"
          @click="goBack"
        >
          <IconArrowLeft />
        </button>
      </div>
      <span class="header-title">{{ pageTitle }}</span>
    </div>

    <div id="backupPanelBody">
      <BackupPage v-if="currentPage === 'BackupPage'" @navigate="navigate" />
      <ExportBackupPage
        v-else-if="currentPage === 'ExportBackupPage'"
        :embedded="true"
      />
      <WebDAVPage v-else-if="currentPage === 'WebDAVPage'" :embedded="true" />
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import IconArrowLeft from "../../../svg/arrow-left.svg";
import BackupPage from "./BackupPage.vue";
import ExportBackupPage from "./ExportBackupPage.vue";
import WebDAVPage from "./WebDAVPage.vue";

export default Vue.extend({
  props: {
    active: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      currentPage: "BackupPage",
    };
  },
  computed: {
    pageTitle(): string {
      if (this.currentPage === "ExportBackupPage") {
        return this.i18n.ui_export_backup;
      }
      if (this.currentPage === "WebDAVPage") {
        return this.i18n.ui_webdav_title;
      }
      return this.i18n.ui_backup_title;
    },
  },
  watch: {
    active(value: boolean) {
      if (value) {
        this.currentPage = "BackupPage";
      }
    },
  },
  methods: {
    navigate(page: string) {
      if (page === "ExportBackupPage" || page === "WebDAVPage") {
        this.currentPage = page;
      }
    },
    goBack() {
      if (this.currentPage !== "BackupPage") {
        this.currentPage = "BackupPage";
        return;
      }
      this.$store.commit("style/hideBackupPanel");
    },
  },
  components: {
    IconArrowLeft,
    BackupPage,
    ExportBackupPage,
    WebDAVPage,
  },
});
</script>
