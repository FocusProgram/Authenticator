<template>
  <div class="header">
    <div class="header-actions header-actions-left" v-show="!isPopup()">
      <button
        type="button"
        class="icon header-icon"
        id="i-menu"
        v-bind:title="i18n.settings"
        v-bind:aria-label="i18n.settings"
        v-on:click="showMenu()"
        v-show="!style.isSelecting"
      >
        <IconCog />
      </button>
      <button
        type="button"
        class="icon header-icon"
        id="i-lock"
        v-bind:title="i18n.lock"
        v-bind:aria-label="i18n.lock"
        v-on:click="lock()"
        v-show="!style.isSelecting && !!defaultEncryption"
      >
        <IconLock />
      </button>
      <button
        type="button"
        class="icon header-icon"
        id="i-backup"
        v-bind:title="i18n.backup"
        v-bind:aria-label="i18n.backup"
        v-on:click="showBackup()"
        v-show="!style.isSelecting"
      >
        <IconBackup />
        <span
          class="header-sync-status"
          id="i-sync"
          v-show="dropboxToken || driveToken || oneDriveToken"
          :title="i18n.ui_automatic_backup"
        >
          <IconSync />
        </span>
      </button>
    </div>

    <span class="header-title" v-on:dblclick="popOut()">
      {{ style.isSelecting ? i18n.ui_batch_edit : i18n.extName }}
    </span>

    <div class="header-actions header-actions-right" v-show="!isPopup()">
      <button
        type="button"
        class="icon header-icon"
        id="i-plus"
        v-bind:title="i18n.add_code"
        v-bind:aria-label="i18n.add_code"
        v-on:click="showInfo('AddMethodPage')"
        v-show="!style.isSelecting"
      >
        <IconPlus />
      </button>
      <button
        type="button"
        class="icon header-icon"
        id="i-qr"
        v-bind:title="i18n.add_qr"
        v-bind:aria-label="i18n.add_qr"
        v-show="!style.isSelecting"
        v-on:click="beginCapture()"
      >
        <IconScan />
      </button>
      <button
        type="button"
        class="icon header-icon"
        id="i-edit"
        :title="i18n.ui_batch_edit"
        :aria-label="i18n.ui_batch_edit"
        v-if="!style.isSelecting"
        v-on:click="toggleSelect()"
      >
        <IconPencil />
      </button>
      <button
        type="button"
        class="icon header-icon"
        id="i-edit"
        v-bind:title="i18n.cancel || 'Cancel'"
        v-bind:aria-label="i18n.cancel || 'Cancel'"
        v-else
        v-on:click="toggleSelect()"
      >
        <IconXCircle />
      </button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState } from "vuex";
import { getCurrentTab, okToInjectContentScript } from "../../utils";

// Icons
import IconCog from "../../../svg/cog.svg";
import IconLock from "../../../svg/lock.svg";
import IconSync from "../../../svg/sync.svg";
import IconScan from "../../../svg/scan.svg";
import IconPencil from "../../../svg/pencil.svg";
import IconPlus from "../../../svg/plus.svg";
import IconBackup from "../../../svg/exchange.svg";
import IconXCircle from "../../../svg/x-circle.svg";
import { isFirefox } from "../../browser";

const computedPrototype = [
  mapState("style", ["style"]),
  mapState("accounts", ["defaultEncryption"]),
  mapState("backup", ["driveToken", "dropboxToken", "oneDriveToken"]),
];

let computed = {};

for (const module of computedPrototype) {
  Object.assign(computed, module);
}

export default Vue.extend({
  computed,
  methods: {
    isPopup() {
      const params = new URLSearchParams(document.location.search.substring(1));
      return params.get("popup");
    },
    popOut() {
      let windowType;
      if (isFirefox) {
        windowType = "detached_panel";
      } else {
        windowType = "panel";
      }
      chrome.windows.create({
        url: chrome.runtime.getURL("view/popup.html?popup=true"),
        type: windowType as chrome.windows.createTypeEnum,
        height: window.innerHeight,
        width: window.innerWidth,
      });
      window.close();
    },
    showMenu() {
      this.$store.commit("style/showMenu");
    },
    showInfo(page: string) {
      if (page === "AddMethodPage") {
        if (
          this.$store.state.menu.enforcePassword &&
          !this.$store.state.accounts.defaultEncryption
        ) {
          page = "SetPasswordPage";
        }
      }
      this.$store.commit("style/showInfo");
      this.$store.commit("currentView/changeView", page);
    },
    showBackup() {
      this.$store.commit("style/showBackupPanel");
    },
    toggleSelect() {
      this.$store.commit("style/toggleSelect");
      this.$store.commit("accounts/stopFilter");
    },
    lock() {
      chrome.runtime.sendMessage({ action: "lock" }, window.close);
      return;
    },
    async beginCapture() {
      if (
        this.$store.state.menu.enforcePassword &&
        !this.$store.state.accounts.defaultEncryption
      ) {
        this.$store.commit("style/showInfo");
        this.$store.commit("currentView/changeView", "SetPasswordPage");
        return;
      }

      if (this.$store.getters["accounts/currentlyEncrypted"]) {
        this.$store.commit("notification/alert", this.i18n.phrase_incorrect);
        return;
      }

      const tab = await getCurrentTab();
      // Insert content script
      if (okToInjectContentScript(tab)) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["/dist/content.js"],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["/css/content.css"],
        });

        if (tab.url?.startsWith("file:")) {
          if (
            await this.$store.dispatch(
              "notification/confirm",
              this.i18n.capture_local_file_failed
            )
          ) {
            window.open("import.html?QrImport", "_blank");
            return;
          }
        }

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
    IconCog,
    IconLock,
    IconSync,
    IconScan,
    IconPencil,
    IconPlus,
    IconBackup,
    IconXCircle,
  },
});
</script>
