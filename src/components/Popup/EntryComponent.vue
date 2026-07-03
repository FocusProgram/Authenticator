<template>
  <a
    role="button"
    data-x-role="entry"
    v-bind:tabindex="tabindex"
    v-bind:class="{
      entry: true,
      pinnedEntry: entry.pinned,
      'no-copy': noCopy(entry.code),
      'select-mode': style.isSelecting,
      expanded: detailsOpen,
    }"
    v-on:click="onEntryClick(entry)"
    v-on:keydown.enter="onEntryClick(entry)"
  >
    <div
      class="select-checkbox"
      v-if="style.isSelecting"
      v-on:click.stop="$emit('toggle-select')"
    >
      <div v-bind:class="{ 'checkbox-inner': true, checked: selected }">
        <IconCheck v-if="selected" />
      </div>
    </div>
    <div class="deleteAction" v-on:click.stop="removeEntry(entry)">
      <IconMinusCircle />
    </div>

    <div class="entry-main">
      <div class="entry-identity">
        <div class="entry-title">
          {{ displayName }}
        </div>
        <div class="issuer account">{{ displayUser }}</div>
        <div class="entry-meta-row" v-if="entry.groupId">
          <div :class="['entry-group', getGroupStyleClass(entry.groupId)]">
            <span class="entry-group-dot"></span>
            <span class="entry-group-text">
              {{ getGroupName(entry.groupId) }}
            </span>
          </div>
        </div>
      </div>

      <div class="entry-code-row">
        <div
          v-bind:class="{
            code: true,
            hotp: entry.type === OTPType.hotp || entry.type === OTPType.hhex,
            timeout: entry.period - (second % entry.period) < 5,
          }"
          v-html="showCode(entry.code)"
        ></div>

        <div class="entry-timer-slot">
          <div
            v-bind:class="{
              sector: true,
              timeout: entry.period - (second % entry.period) < 5,
            }"
            v-if="entry.type !== OTPType.hotp && entry.type !== OTPType.hhex"
            v-show="sectorStart"
          >
            <svg viewBox="0 0 36 36">
              <circle class="sector-bg" cx="18" cy="18" r="15.9" />
              <circle
                class="sector-fg"
                cx="18"
                cy="18"
                r="15.9"
                v-bind:style="{
                  animationDuration: entry.period + 's',
                  animationDelay: (sectorOffset % entry.period) + 's',
                }"
              />
            </svg>
            <span class="countdown">{{
              entry.period - (second % entry.period)
            }}</span>
          </div>
          <div
            v-bind:class="{ counter: true, disabled: style.hotpDiabled }"
            v-if="entry.type === OTPType.hotp || entry.type === OTPType.hhex"
            v-on:click.stop="nextCode(entry)"
          >
            <IconRedo />
          </div>
        </div>
      </div>

      <div class="entry-note" v-if="entry.note">
        {{ entry.note }}
      </div>
    </div>

    <div class="entry-tools">
      <div class="entry-actions-row">
        <div
          class="showqr"
          v-if="shouldShowQrIcon(entry)"
          title="显示二维码"
          v-on:click.stop="showQr(entry)"
        >
          <IconQr />
        </div>
        <div
          class="copyotpauth"
          v-if="shouldShowQrIcon(entry)"
          title="复制 OTP 链接"
          v-on:click.stop="copyOtpAuth(entry)"
        >
          <IconClipboardCheck />
        </div>
        <div
          v-bind:class="{ pin: true, pinned: entry.pinned }"
          :title="entry.pinned ? '取消置顶' : '置顶'"
          v-on:click.stop="pin(entry)"
        >
          <IconPin />
        </div>
      </div>

      <button
        type="button"
        class="entry-detail-trigger"
        v-on:click.stop="toggleDetails()"
      >
        <IconInfo />
      </button>
    </div>

    <div class="entry-details" v-if="detailsOpen" v-on:click.stop>
      <div class="entry-detail-grid" v-if="entry.secret !== null">
        <label>{{ i18n.issuer || "Name" }}</label>
        <input class="input" type="text" v-model="draft.issuer" />

        <label>{{ i18n.accountName || "User" }}</label>
        <input class="input" type="text" v-model="draft.account" />

        <label>{{ i18n.note || "Note" }}</label>
        <textarea class="input detail-textarea" v-model="draft.note"></textarea>

        <label>{{ i18n.secret || "Secret" }}</label>
        <input class="input detail-secret" type="text" v-model="draft.secret" />

        <label>分组</label>
        <select class="input" v-model="draft.groupId">
          <option value="">未分组</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </option>
        </select>
      </div>
      <div class="entry-detail-locked" v-else>
        {{ i18n.encrypted || "Unlock this item to edit its details." }}
      </div>
      <div class="entry-detail-actions">
        <button class="button" type="button" v-on:click.stop="toggleDetails()">
          {{ i18n.cancel || "Cancel" }}
        </button>
        <button
          class="button primary"
          type="button"
          v-if="entry.secret !== null"
          v-on:click.stop="saveDetails()"
        >
          {{ i18n.ok || "Save" }}
        </button>
      </div>
    </div>
  </a>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState } from "vuex";
import * as QRGen from "qrcode-generator";
import {
  OTPEntry,
  OTPType,
  CodeState,
  OTPAlgorithm,
  normalizeOtpSecretForType,
} from "../../models/otp";
import { EntryStorage } from "../../models/storage";
import { getCurrentTab, okToInjectContentScript } from "../../utils";

import IconMinusCircle from "../../../svg/minus-circle.svg";
import IconRedo from "../../../svg/redo.svg";
import IconQr from "../../../svg/qrcode.svg";
import IconClipboardCheck from "../../../svg/clipboard-check.svg";
import IconPin from "../../../svg/pin.svg";
import IconCheck from "../../../svg/check.svg";
import IconInfo from "../../../svg/info.svg";

const computedPrototype = [
  mapState("accounts", [
    "OTPType",
    "sectorStart",
    "sectorOffset",
    "second",
    "encryption",
  ]),
  mapState("style", ["style"]),
];

let computed = {};

for (const module of computedPrototype) {
  Object.assign(computed, module);
}

export default Vue.extend({
  computed: {
    ...computed,
    groups(): OTPGroupInterface[] {
      return this.$store.state.groups.groups;
    },
    displayName(): string {
      return this.entry.issuer?.split("::")[0] || this.i18n.issuer || "Name";
    },
    displayUser(): string {
      return this.entry.account || this.i18n.accountName || "User";
    },
  },
  props: {
    entry: OTPEntry,
    tabindex: Number,
    selected: Boolean,
  },
  data() {
    return {
      detailsOpen: false,
      draft: {
        issuer: "",
        account: "",
        note: "",
        secret: "",
        groupId: "",
      },
    };
  },
  methods: {
    noCopy(code: string) {
      return (
        code === CodeState.Encrypted ||
        code === CodeState.Invalid ||
        code.startsWith("&bull;")
      );
    },
    shouldShowQrIcon(entry: OTPEntry) {
      return (
        !this.$store.state.menu.exportDisabled &&
        entry.secret !== null &&
        entry.type !== OTPType.battle &&
        entry.type !== OTPType.steam
      );
    },
    showCode(code: string) {
      if (code === CodeState.Encrypted) {
        return this.i18n.encrypted;
      } else if (code === CodeState.Invalid) {
        return this.i18n.invalid;
      } else {
        return code;
      }
    },
    syncDraft() {
      this.draft = {
        issuer: this.entry.issuer || "",
        account: this.entry.account || "",
        note: this.entry.note || "",
        secret: this.entry.secret || "",
        groupId: this.entry.groupId || "",
      };
    },
    toggleDetails() {
      this.detailsOpen = !this.detailsOpen;
      if (this.detailsOpen) {
        this.syncDraft();
      }
    },
    async saveDetails() {
      const normalizedSecretData = normalizeOtpSecretForType(
        this.draft.secret,
        this.entry.type
      );
      if (!normalizedSecretData) {
        this.$store.commit("notification/alert", this.i18n.errorsecret);
        return;
      }

      const { secret, type } = normalizedSecretData;

      this.entry.issuer = this.draft.issuer.trim();
      this.entry.account = this.draft.account.trim();
      this.entry.note = this.draft.note.trim();
      this.entry.groupId = this.draft.groupId || undefined;
      this.entry.secret = secret;
      this.entry.type = type;

      if (
        this.entry.type !== OTPType.hotp &&
        this.entry.type !== OTPType.hhex &&
        this.entry.secret
      ) {
        this.entry.generate();
      }

      await this.entry.update();
      this.detailsOpen = false;
      this.$store.dispatch("accounts/updateEntries");
      this.$store.commit(
        "notification/alert",
        this.i18n.updateSuccess || "Saved"
      );
    },
    onEntryClick(entry: OTPEntry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((this as any).style.isSelecting) {
        this.$emit("toggle-select");
        return;
      }
      if (this.detailsOpen) {
        return;
      }
      this.copyCode(entry);
    },
    async removeEntry(entry: OTPEntry) {
      if (
        await this.$store.dispatch(
          "notification/confirm",
          this.i18n.confirm_delete
        )
      ) {
        await entry.delete();
        await this.$store.dispatch("accounts/deleteCode", entry.hash);
      }
      return;
    },
    async pin(entry: OTPEntry) {
      this.$store.commit("accounts/pinEntry", entry);
      await EntryStorage.set(this.$store.state.accounts.entries);
      const codesEl = document.getElementById("codes") as HTMLDivElement;
      codesEl.scrollTop = 0;
    },
    showQr(entry: OTPEntry) {
      this.$store.commit("qr/setQr", getQrUrl(entry));
      this.$store.commit("style/showQr");
      return;
    },
    copyOtpAuth(entry: OTPEntry) {
      const otpAuth = getOtpAuthUrl(entry);
      chrome.permissions.request(
        { permissions: ["clipboardWrite"] },
        async (granted) => {
          if (!granted) {
            return;
          }

          try {
            await navigator.clipboard.writeText(otpAuth);
          } catch {
            const codeClipboard = document.getElementById(
              "codeClipboard"
            ) as HTMLInputElement | null;
            if (!codeClipboard) {
              return;
            }
            const lastActiveElement = document.activeElement as HTMLElement | null;
            codeClipboard.value = otpAuth;
            codeClipboard.focus();
            codeClipboard.select();
            document.execCommand("Copy");
            lastActiveElement?.focus();
          }

          this.$store.dispatch(
            "notification/ephermalMessage",
            "已复制 OTP 链接"
          );
        }
      );
    },
    getGroupName(groupId: string) {
      const group = this.$store.state.groups.groups.find(
        (item: OTPGroupInterface) => item.id === groupId
      );
      return group?.name || this.i18n.group_ungrouped || "Ungrouped";
    },
    getGroupStyleClass(groupId: string) {
      const palettes = [
        "group-style-amber",
        "group-style-green",
        "group-style-rose",
        "group-style-purple",
        "group-style-slate",
        "group-style-teal",
        "group-style-cyan",
      ];
      let hash = 0;
      for (let i = 0; i < groupId.length; i++) {
        hash = (hash * 31 + groupId.charCodeAt(i)) >>> 0;
      }
      return palettes[hash % palettes.length];
    },
    async nextCode(entry: OTPEntry) {
      if (this.$store.state.style.hotpDisabled) {
        return;
      }
      this.$store.commit("style/toggleHotpDisabled");
      await entry.next();
      setTimeout(() => {
        this.$store.commit("style/toggleHotpDisabled");
      }, 3000);
      return;
    },
    async copyCode(entry: OTPEntry) {
      if (
        this.$store.state.style.style.isEditing ||
        entry.code === CodeState.Invalid ||
        entry.code.startsWith("&bull;")
      ) {
        return;
      }

      if (entry.code === CodeState.Encrypted) {
        this.$store.commit("style/showInfo", true);
        this.$store.commit("currentView/changeView", "EnterPasswordPage");
        return;
      }

      chrome.permissions.request(
        { permissions: ["clipboardWrite"] },
        async (granted) => {
          if (granted) {
            const codeClipboard = document.getElementById(
              "codeClipboard"
            ) as HTMLInputElement;
            if (!codeClipboard) {
              return;
            }

            if (this.$store.state.menu.useAutofill) {
              await insertContentScript();
              const tab = await getCurrentTab();
              if (tab && tab.id) {
                chrome.tabs.sendMessage(
                  tab.id,
                  {
                    action: "pastecode",
                    code: entry.code,
                  },
                  () => {
                    if (chrome.runtime.lastError) {
                      return;
                    }
                  }
                );
              }
            }

            const lastActiveElement = document.activeElement as HTMLElement;
            codeClipboard.value = entry.code;
            codeClipboard.focus();
            codeClipboard.select();
            document.execCommand("Copy");
            lastActiveElement.focus();
            this.$store.dispatch(
              "notification/ephermalMessage",
              this.i18n.copied
            );
          }
        }
      );

      return;
    },
  },
  components: {
    IconMinusCircle,
    IconRedo,
    IconQr,
    IconClipboardCheck,
    IconPin,
    IconCheck,
    IconInfo,
  },
});

function getOtpAuthUrl(entry: OTPEntry) {
  const label = entry.issuer
    ? entry.issuer + ":" + entry.account
    : entry.account;
  const type =
    entry.type === OTPType.hex
      ? OTPType[OTPType.totp]
      : entry.type === OTPType.hhex
      ? OTPType[OTPType.hotp]
      : OTPType[entry.type];
  return (
    "otpauth://" +
    type +
    "/" +
    encodeURIComponent(label) +
    "?secret=" +
    entry.secret +
    (entry.issuer
      ? "&issuer=" + encodeURIComponent(entry.issuer.split("::")[0])
      : "") +
    (entry.type === OTPType.hotp || entry.type === OTPType.hhex
      ? "&counter=" + entry.counter
      : "") +
    (entry.type === OTPType.totp && entry.period !== 30
      ? "&period=" + entry.period
      : "") +
    (entry.digits !== 6 ? "&digits=" + entry.digits : "") +
    (entry.algorithm !== OTPAlgorithm.SHA1
      ? "&algorithm=" + OTPAlgorithm[entry.algorithm]
      : "")
  );
}

function getQrUrl(entry: OTPEntry) {
  const otpauth = getOtpAuthUrl(entry);
  const qr = QRGen(0, "L");
  qr.addData(otpauth);
  qr.make();
  return qr.createDataURL(5);
}

async function insertContentScript() {
  let tab = await getCurrentTab();
  if (okToInjectContentScript(tab)) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/dist/content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["/css/content.css"],
    });
  }
}
</script>
