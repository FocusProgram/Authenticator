<template>
  <div
    v-bind:class="{
      'entry-swipe-shell': true,
      open: swipeOpen,
      dragging: swipeDragging,
    }"
  >
    <div
      class="entry-swipe-actions"
      v-bind:aria-hidden="swipeOpen ? 'false' : 'true'"
      v-on:click.stop
    >
      <button
        type="button"
        class="entry-swipe-action edit"
        :title="i18n.ui_edit_otp"
        v-bind:tabindex="swipeOpen ? 0 : -1"
        v-on:click.stop="openDetailsFromSwipe()"
      >
        <IconPencil />
        <span>{{ i18n.edit }}</span>
      </button>
      <button
        type="button"
        class="entry-swipe-action delete"
        :title="i18n.ui_delete_otp"
        v-bind:tabindex="swipeOpen ? 0 : -1"
        v-on:click.stop="removeEntry(entry)"
      >
        <IconXCircle />
        <span>{{ i18n.delete }}</span>
      </button>
    </div>

    <div
      role="button"
      data-x-role="entry"
      v-bind:tabindex="tabindex"
      v-bind:aria-expanded="detailsOpen ? 'true' : 'false'"
      v-bind:style="swipeTransformStyle"
      v-bind:class="{
        entry: true,
        pinnedEntry: entry.pinned,
        'no-copy': noCopy(entry.code),
        'select-mode': style.isSelecting,
        'is-selected': style.isSelecting && selected,
        expanded: detailsOpen,
      }"
      v-on:click="onEntryClick(entry)"
      v-on:keydown.enter.self.prevent="onEntryClick(entry)"
      v-on:keydown.space.self.prevent="onEntryClick(entry)"
      v-on:keydown.delete.self.stop.prevent="removeEntry(entry)"
      v-on:keydown.e.self.stop.prevent="openDetailsFromSwipe()"
      v-on:pointerdown="onSwipePointerDown"
      v-on:pointermove="onSwipePointerMove"
      v-on:pointerup="onSwipePointerEnd"
      v-on:pointercancel="onSwipePointerEnd"
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

      <div class="entry-main">
        <div class="entry-identity">
          <div class="entry-title">
            {{ displayName }}
          </div>
          <div class="issuer account">{{ displayUser }}</div>
          <div class="entry-meta-row" v-if="currentGroup">
            <div :class="['entry-group', groupStyleClass]">
              <span class="entry-group-icon" aria-hidden="true">
                <IconTag />
              </span>
              <span class="entry-group-text">
                {{ displayGroupName }}
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
            <button
              type="button"
              v-bind:class="{ counter: true, disabled: style.hotpDisabled }"
              v-if="entry.type === OTPType.hotp || entry.type === OTPType.hhex"
              v-bind:disabled="style.hotpDisabled"
              v-on:click.stop="nextCode(entry)"
            >
              <IconRedo />
            </button>
          </div>
        </div>

        <div class="entry-note" v-if="entry.note">
          {{ entry.note }}
        </div>
      </div>

      <EntryActions
        :entry="entry"
        :show-export-actions="shouldShowQrIcon(entry)"
        @show-qr="showQr(entry)"
        @copy-otp="copyOtpAuth(entry)"
        @pin="pin(entry)"
        @view-details="openViewDetails()"
      />

      <div class="entry-details" v-if="detailsOpen" v-on:click.stop>
        <template v-if="entry.secret !== null">
          <div class="entry-detail-grid" v-if="detailsMode === 'edit'">
            <label>{{ i18n.issuer || "Name" }}</label>
            <input class="input" type="text" v-model="draft.issuer" />

            <label>{{ i18n.accountName || "Account" }}</label>
            <input class="input" type="text" v-model="draft.account" />

            <label>{{ i18n.note || "Notes" }}</label>
            <textarea
              class="input detail-textarea"
              v-model="draft.note"
            ></textarea>

            <label>{{ i18n.secret || "Secret" }}</label>
            <input
              class="input detail-secret"
              type="text"
              v-model="draft.secret"
            />

            <label>{{ i18n.ui_group_section }}</label>
            <select class="input" v-model="draft.groupId">
              <option value="">{{ i18n.group_ungrouped }}</option>
              <option v-for="group in groups" :key="group.id" :value="group.id">
                {{ group.name }}
              </option>
            </select>
          </div>

          <div class="entry-detail-view" v-else>
            <div class="entry-detail-view-row">
              <span class="entry-detail-view-label">{{ i18n.issuer }}</span>
              <span class="entry-detail-view-value">
                {{ entry.issuer ? entry.issuer.split("::")[0] : "—" }}
              </span>
            </div>
            <div class="entry-detail-view-row">
              <span class="entry-detail-view-label">{{
                i18n.accountName
              }}</span>
              <span class="entry-detail-view-value">
                {{ entry.account || "—" }}
              </span>
            </div>
            <div class="entry-detail-view-row">
              <span class="entry-detail-view-label">{{ i18n.note }}</span>
              <span class="entry-detail-view-value multiline">
                {{ entry.note || "—" }}
              </span>
            </div>
            <div class="entry-detail-view-row">
              <span class="entry-detail-view-label">{{ i18n.secret }}</span>
              <span class="entry-detail-view-value secret">
                {{ entry.secret }}
              </span>
            </div>
            <div class="entry-detail-view-row">
              <span class="entry-detail-view-label">{{
                i18n.ui_group_section
              }}</span>
              <span class="entry-detail-view-value">
                {{ displayGroupName }}
              </span>
            </div>
          </div>
        </template>
        <div class="entry-detail-locked" v-else>
          {{
            i18n.encrypted ||
            (detailsMode === "edit"
              ? i18n.ui_unlock_to_edit
              : i18n.ui_unlock_to_view)
          }}
        </div>
        <div class="entry-detail-actions">
          <button class="button" type="button" v-on:click.stop="closeDetails()">
            {{ detailsMode === "view" ? i18n.close : i18n.cancel }}
          </button>
          <button
            class="button primary"
            type="button"
            v-if="entry.secret !== null && detailsMode === 'edit'"
            v-on:click.stop="saveDetails()"
          >
            {{ i18n.save || i18n.ok }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState } from "vuex";
import * as QRGen from "qrcode-generator";
import {
  OTPEntry,
  OTPType,
  CodeState,
  normalizeOtpSecretForType,
} from "../../models/otp";
import { EntryStorage } from "../../models/storage";
import { buildOtpAuthUri } from "../../models/otpauth-uri";
import { getCurrentTab, okToInjectContentScript } from "../../utils";

import IconRedo from "../../../svg/redo.svg";
import IconCheck from "../../../svg/check.svg";
import IconPencil from "../../../svg/pencil.svg";
import IconTag from "../../../svg/tag.svg";
import IconXCircle from "../../../svg/x-circle.svg";
import EntryActions from "./EntryActions.vue";

const SWIPE_ACTION_WIDTH = 96;
const SWIPE_OPEN_THRESHOLD = 40;

const computedPrototype = [
  mapState("accounts", ["OTPType", "sectorStart", "sectorOffset", "second"]),
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
    currentGroup(): OTPGroupInterface | undefined {
      if (!this.entry.groupId) {
        return undefined;
      }
      return this.groups.find((group) => group.id === this.entry.groupId);
    },
    displayGroupName(): string {
      return (
        this.currentGroup?.name || this.i18n.group_ungrouped || "Ungrouped"
      );
    },
    groupStyleClass(): string {
      return getGroupPaletteClass(this.entry.groupId || "");
    },
    displayName(): string {
      return this.entry.issuer?.split("::")[0] || this.i18n.issuer || "Name";
    },
    displayUser(): string {
      return this.entry.account || this.i18n.accountName || "Account";
    },
    swipeTransformStyle(): { transform: string } {
      return {
        transform: `translate3d(${this.swipeOffset}px, 0, 0)`,
      };
    },
  },
  props: {
    entry: OTPEntry,
    tabindex: Number,
    selected: Boolean,
    swipeOpen: Boolean,
  },
  data() {
    return {
      detailsOpen: false,
      detailsMode: "view" as "view" | "edit",
      swipeOffset: this.swipeOpen ? -SWIPE_ACTION_WIDTH : 0,
      swipeDragging: false,
      swipeStartX: 0,
      swipeStartY: 0,
      swipeStartOffset: 0,
      swipePointerId: -1,
      swipeAxis: "" as "" | "x" | "y",
      suppressEntryClick: false,
      draft: {
        issuer: "",
        account: "",
        note: "",
        secret: "",
        groupId: "",
      },
    };
  },
  watch: {
    swipeOpen(open: boolean) {
      if (!this.swipeDragging) {
        this.swipeOffset = open ? -SWIPE_ACTION_WIDTH : 0;
      }
    },
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
    closeDetails() {
      this.detailsOpen = false;
    },
    openViewDetails() {
      this.closeSwipeActions();
      if (this.detailsOpen && this.detailsMode === "view") {
        this.closeDetails();
        return;
      }
      this.detailsMode = "view";
      this.detailsOpen = true;
    },
    openDetailsFromSwipe() {
      this.closeSwipeActions();
      this.detailsMode = "edit";
      this.syncDraft();
      this.detailsOpen = true;
    },
    closeSwipeActions() {
      this.swipeOffset = 0;
      this.$emit("close-swipe");
    },
    onSwipePointerDown(event: PointerEvent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentStyle = (this as any).style as StyleState["style"];
      if (
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0) ||
        currentStyle.isSelecting ||
        this.detailsOpen
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, input, textarea, select, .entry-tools, .entry-timer-slot"
        )
      ) {
        return;
      }

      this.swipeDragging = true;
      this.swipePointerId = event.pointerId;
      this.swipeStartX = event.clientX;
      this.swipeStartY = event.clientY;
      this.swipeStartOffset = this.swipeOpen ? -SWIPE_ACTION_WIDTH : 0;
      this.swipeAxis = "";
      this.suppressEntryClick = false;

      const currentTarget = event.currentTarget as HTMLElement | null;
      currentTarget?.setPointerCapture?.(event.pointerId);
    },
    onSwipePointerMove(event: PointerEvent) {
      if (!this.swipeDragging || event.pointerId !== this.swipePointerId) {
        return;
      }

      const deltaX = event.clientX - this.swipeStartX;
      const deltaY = event.clientY - this.swipeStartY;

      if (!this.swipeAxis) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 6) {
          return;
        }
        this.swipeAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      }

      if (this.swipeAxis === "y") {
        return;
      }

      event.preventDefault();
      this.suppressEntryClick = true;
      this.swipeOffset = Math.max(
        -SWIPE_ACTION_WIDTH,
        Math.min(0, this.swipeStartOffset + deltaX)
      );
    },
    onSwipePointerEnd(event: PointerEvent) {
      if (!this.swipeDragging || event.pointerId !== this.swipePointerId) {
        return;
      }

      const currentTarget = event.currentTarget as HTMLElement | null;
      if (currentTarget?.hasPointerCapture?.(event.pointerId)) {
        currentTarget.releasePointerCapture(event.pointerId);
      }

      const shouldOpen =
        this.swipeAxis === "x" && this.swipeOffset <= -SWIPE_OPEN_THRESHOLD;
      this.swipeOffset = shouldOpen ? -SWIPE_ACTION_WIDTH : 0;
      this.swipeDragging = false;
      this.swipePointerId = -1;
      this.swipeAxis = "";

      this.$emit(shouldOpen ? "open-swipe" : "close-swipe");
      window.setTimeout(() => {
        this.suppressEntryClick = false;
      }, 0);
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
        this.i18n.updateSuccess || this.i18n.ui_saved
      );
    },
    onEntryClick(entry: OTPEntry) {
      if (this.suppressEntryClick) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((this as any).style.isSelecting) {
        this.$emit("toggle-select");
        return;
      }
      if (this.swipeOpen) {
        this.closeSwipeActions();
        return;
      }
      if (this.detailsOpen) {
        return;
      }
      this.copyCode(entry);
    },
    async removeEntry(entry: OTPEntry) {
      this.closeSwipeActions();
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
      await EntryStorage.updateMany([entry]);
      const codesEl = document.getElementById("codes") as HTMLDivElement;
      if (codesEl) {
        codesEl.scrollTop = 0;
      }
    },
    showQr(entry: OTPEntry) {
      const qrUrl = getQrUrl(entry);
      if (!qrUrl) {
        return;
      }
      this.$store.commit("qr/setQr", qrUrl);
      this.$store.commit("style/showQr");
      return;
    },
    copyOtpAuth(entry: OTPEntry) {
      const otpAuth = buildOtpAuthUri(entry);
      if (!otpAuth) {
        return;
      }
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
            this.i18n.ui_copy_otp_link_success
          );
        }
      );
    },
    async nextCode(entry: OTPEntry) {
      const currentStyle = (this as any).style as StyleState["style"];
      if (currentStyle.hotpDisabled) {
        return;
      }
      this.$store.commit("style/setHotpDisabled", true);
      try {
        await entry.next();
      } finally {
        setTimeout(() => {
          this.$store.commit("style/setHotpDisabled", false);
        }, 3000);
      }
      return;
    },
    async copyCode(entry: OTPEntry) {
      if (entry.code === CodeState.Invalid || entry.code.startsWith("&bull;")) {
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
    IconRedo,
    IconCheck,
    IconPencil,
    IconTag,
    IconXCircle,
    EntryActions,
  },
});

function getGroupPaletteClass(groupId: string) {
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
}

function getQrUrl(entry: OTPEntry) {
  const otpauth = buildOtpAuthUri(entry);
  if (!otpauth) {
    return "";
  }
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
