<template>
  <div class="subpage add-method-page">
    <div class="subpage-head">
      <div class="subpage-title">{{ i18n.ui_add_method_title }}</div>
      <div class="subpage-subtitle">
        {{ i18n.ui_add_method_subtitle }}
      </div>
    </div>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">
          {{ i18n.ui_add_method_section }}
        </div>
      </div>
      <div class="subpage-list-card">
        <button
          type="button"
          class="subpage-row add-method-row"
          @click="beginCapture"
        >
          <span class="subpage-row-icon"><IconScan /></span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">
              {{ i18n.add_qr || "Scan QR code" }}
            </span>
            <span class="subpage-row-desc">{{ i18n.ui_scan_page_desc }}</span>
          </span>
          <IconArrowLeft class="subpage-row-arrow" />
        </button>

        <button
          type="button"
          class="subpage-row add-method-row"
          @click="showInfo('AddAccountPage')"
        >
          <span class="subpage-row-icon"><IconKey /></span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">
              {{ i18n.add_secret || "Manual entry" }}
            </span>
            <span class="subpage-row-desc">{{
              i18n.ui_manual_entry_desc
            }}</span>
          </span>
          <IconArrowLeft class="subpage-row-arrow" />
        </button>

        <a
          class="subpage-row add-method-row"
          href="import.html?QrImport"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="subpage-row-icon"><IconQr /></span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">
              {{ i18n.import_qr_images || "Import QR images" }}
            </span>
            <span class="subpage-row-desc">{{ i18n.ui_import_qr_desc }}</span>
          </span>
          <IconArrowLeft class="subpage-row-arrow" />
        </a>

        <a
          class="subpage-row add-method-row"
          href="import.html?TextImport"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="subpage-row-icon"><IconClipboardCheck /></span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">
              {{ i18n.import_otp_urls || "Import OTP links" }}
            </span>
            <span class="subpage-row-desc">{{
              i18n.ui_import_links_desc
            }}</span>
          </span>
          <IconArrowLeft class="subpage-row-arrow" />
        </a>

        <a
          data-test="import-backup-file"
          class="subpage-row add-method-row"
          href="import.html?FileImport"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="subpage-row-icon"><IconRedo /></span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">
              {{ i18n.import_backup_file }}
            </span>
            <span class="subpage-row-desc">
              {{ i18n.ui_import_backup_file_desc }}
            </span>
          </span>
          <IconArrowLeft class="subpage-row-arrow" />
        </a>
      </div>
    </section>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { getCurrentTab, okToInjectContentScript } from "../../utils";
import IconArrowLeft from "../../../svg/arrow-left.svg";
import IconClipboardCheck from "../../../svg/clipboard-check.svg";
import IconKey from "../../../svg/key-solid.svg";
import IconQr from "../../../svg/qrcode.svg";
import IconRedo from "../../../svg/redo.svg";
import IconScan from "../../../svg/scan.svg";

export default Vue.extend({
  methods: {
    showInfo(page: string) {
      if (this.$store.getters["accounts/currentlyEncrypted"]) {
        this.$store.commit("notification/alert", this.i18n.phrase_incorrect);
        return;
      }
      this.$store.commit("currentView/changeView", page);
    },
    async beginCapture() {
      if (this.$store.getters["accounts/currentlyEncrypted"]) {
        this.$store.commit("notification/alert", this.i18n.phrase_incorrect);
        return;
      }

      // Insert content script
      const tab = await getCurrentTab();
      if (okToInjectContentScript(tab)) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["/dist/content.js"],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["/css/content.css"],
        });

        chrome.runtime.sendMessage(
          { action: "updateContentTab", data: tab },
          () => {
            if (chrome.runtime.lastError) {
              return;
            }
          }
        );
        chrome.tabs.sendMessage(tab.id, { action: "capture" }, (result) => {
          if (chrome.runtime.lastError) {
            this.$store.commit("notification/alert", this.i18n.capture_failed);
            return;
          }
          if (result !== "beginCapture") {
            this.$store.commit("notification/alert", this.i18n.capture_failed);
          } else {
            window.close();
          }
        });
      }
    },
  },
  components: {
    IconArrowLeft,
    IconClipboardCheck,
    IconKey,
    IconQr,
    IconRedo,
    IconScan,
  },
});
</script>
