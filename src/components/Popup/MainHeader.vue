<template>
  <div class="header">
    <span v-on:dblclick="popOut()">{{ i18n.extName }}</span>
    <div v-show="!isPopup()">
      <div
        class="icon"
        id="i-menu"
        v-bind:title="i18n.settings"
        v-on:click="showMenu()"
        v-show="!style.isEditing && !style.isSelecting"
      >
        <IconCog />
      </div>
      <div
        class="icon"
        id="i-plus"
        v-bind:title="i18n.add_code"
        v-on:click="showInfo('AddMethodPage')"
      >
        <IconPlus />
      </div>
      <div
        class="icon"
        id="i-lock"
        v-bind:title="i18n.lock"
        v-on:click="lock()"
        v-show="!style.isEditing && !style.isSelecting && !!defaultEncryption"
      >
        <IconLock />
      </div>
      <div
        class="icon"
        id="i-backup"
        v-bind:title="i18n.backup"
        v-on:click="showBackup()"
        v-show="!style.isEditing && !style.isSelecting"
      >
        <IconBackup />
      </div>
      <div
        class="icon"
        id="i-sync"
        v-bind:style="{
          left: !!defaultEncryption ? '120px' : '95px',
        }"
        v-show="
          (dropboxToken || driveToken || oneDriveToken) &&
          !style.isEditing &&
          !style.isSelecting
        "
      >
        <IconSync />
      </div>
      <div
        class="icon"
        id="i-qr"
        v-bind:title="i18n.add_qr"
        v-show="!style.isEditing && !style.isSelecting"
        v-on:click="beginCapture()"
      >
        <IconScan />
      </div>
      <div
        class="icon"
        id="i-edit"
        v-bind:title="i18n.edit"
        v-if="!style.isSelecting"
        v-on:click="toggleSelect()"
      >
        <IconPencil />
      </div>
      <div
        class="icon"
        id="i-edit"
        v-bind:title="i18n.cancel || 'Cancel'"
        v-else
        v-on:click="toggleSelect()"
      >
        <IconXCircle />
      </div>
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
import IconBackup from "../../../svg/sync.svg";
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
      this.$store.commit("style/showInfo");
      this.$store.commit("currentView/changeView", "BackupPage");
    },
    editEntry() {
      this.$store.commit("style/toggleEdit");
      this.$store.commit("accounts/stopFilter");
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
