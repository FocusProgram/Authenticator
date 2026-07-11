<template>
  <div class="settings-shell">
    <div class="header">
      <div class="header-actions header-actions-left">
        <button
          type="button"
          class="header-icon settings-back-button"
          :title="i18n.back"
          :aria-label="i18n.back"
          @click="hideMenu"
        >
          <IconArrowLeft />
        </button>
      </div>
      <span id="menuName" class="header-title">{{ i18n.settings }}</span>
    </div>

    <div id="menuBody" class="settings-page">
      <div class="settings-page-description">
        {{ i18n.ui_settings_desc }}
      </div>

      <section class="subpage-section">
        <div class="subpage-section-head">
          <div class="subpage-section-title">{{ i18n.ui_menu_account }}</div>
        </div>
        <div class="subpage-list-card settings-list">
          <button
            type="button"
            class="subpage-row settings-row"
            :title="i18n.advisor"
            @click="showInfo('AdvisorPage')"
          >
            <span class="subpage-row-icon"><IconAdvisor /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{ i18n.advisor }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_advisor_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>

          <button
            type="button"
            class="subpage-row settings-row"
            :title="i18n.ui_group_title"
            @click="showInfo('GroupsPage')"
          >
            <span class="subpage-row-icon"><IconBars /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{ i18n.ui_group_title }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_groups_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>

          <a
            class="subpage-row settings-row"
            href="permissions.html"
            target="_blank"
            rel="noopener noreferrer"
            :title="i18n.ui_permissions_title"
          >
            <span class="subpage-row-icon"><IconClipboardCheck /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{
                i18n.ui_permissions_title
              }}</span>
              <span class="subpage-row-desc">{{
                i18n.ui_permissions_desc
              }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </a>
        </div>
      </section>

      <section class="subpage-section">
        <div class="subpage-section-head">
          <div class="subpage-section-title">
            {{ i18n.ui_menu_security_data }}
          </div>
        </div>
        <div class="subpage-list-card settings-list">
          <button
            type="button"
            class="subpage-row settings-row"
            :title="i18n.ui_backup_restore"
            @click="showBackup"
          >
            <span class="subpage-row-icon"><IconExchange /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{
                i18n.ui_backup_restore
              }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_backup_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>

          <button
            type="button"
            class="subpage-row settings-row"
            :title="i18n.ui_security_title"
            @click="showInfo('SetPasswordPage')"
          >
            <span class="subpage-row-icon"><IconLock /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{
                i18n.ui_security_title
              }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_security_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>

          <button
            v-if="isSupported"
            type="button"
            class="subpage-row settings-row"
            :title="i18n.sync_clock"
            @click="syncClock"
          >
            <span class="subpage-row-icon"><IconSync /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{ i18n.sync_clock }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_clock_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>

          <button
            type="button"
            class="subpage-row settings-row"
            :title="i18n.ui_preferences_title"
            @click="showInfo('PreferencesPage')"
          >
            <span class="subpage-row-icon"><IconWrench /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{
                i18n.ui_preferences_title
              }}</span>
              <span class="subpage-row-desc">{{
                i18n.ui_preferences_desc
              }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>
        </div>
      </section>

      <section class="subpage-section">
        <div class="subpage-section-head">
          <div class="subpage-section-title">{{ i18n.ui_help_about }}</div>
        </div>
        <div class="subpage-list-card settings-list">
          <button
            type="button"
            class="subpage-row settings-row"
            data-test="feedback"
            :title="i18n.feedback"
            @click="openHelp"
          >
            <span class="subpage-row-icon"><IconComments /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{ i18n.feedback }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_feedback_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>

          <button
            type="button"
            class="subpage-row settings-row"
            :title="i18n.translate"
            @click="openLink('https://otp.ee/translate')"
          >
            <span class="subpage-row-icon"><IconGlobe /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{ i18n.translate }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_translate_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>

          <button
            type="button"
            class="subpage-row settings-row"
            :title="i18n.source"
            @click="openLink('https://otp.ee/sourcecode')"
          >
            <span class="subpage-row-icon"><IconCode /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{ i18n.source }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_source_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </button>

          <a
            class="subpage-row settings-row"
            href="licenses.html"
            target="_blank"
            rel="noopener noreferrer"
            :title="i18n.about"
          >
            <span class="subpage-row-icon"><IconInfo /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">{{
                i18n.ui_about_authenticator
              }}</span>
              <span class="subpage-row-desc">{{ i18n.ui_about_desc }}</span>
            </span>
            <IconArrowLeft class="subpage-row-arrow" />
          </a>
        </div>
      </section>

      <div id="version">{{ i18n.ui_version }} {{ version }}</div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { syncTimeWithGoogle } from "../../syncTime";

import IconArrowLeft from "../../../svg/arrow-left.svg";
import IconInfo from "../../../svg/info.svg";
import IconExchange from "../../../svg/exchange.svg";
import IconBars from "../../../svg/bars.svg";
import IconLock from "../../../svg/lock.svg";
import IconSync from "../../../svg/sync.svg";
import IconWrench from "../../../svg/wrench.svg";
import IconAdvisor from "../../../svg/lightbulb.svg";
import IconComments from "../../../svg/comments.svg";
import IconGlobe from "../../../svg/globe.svg";
import IconCode from "../../../svg/code.svg";
import IconClipboardCheck from "../../../svg/clipboard-check.svg";
import { isSafari } from "../../browser";
import { UserSettings } from "../../models/settings";

export default Vue.extend({
  components: {
    IconArrowLeft,
    IconInfo,
    IconExchange,
    IconBars,
    IconLock,
    IconSync,
    IconWrench,
    IconAdvisor,
    IconComments,
    IconGlobe,
    IconCode,
    IconClipboardCheck,
  },
  computed: {
    version: function () {
      return this.$store.state.menu.version;
    },
    isSupported: {
      get(): boolean {
        return !isSafari;
      },
    },
  },
  methods: {
    hideMenu() {
      this.$store.commit("style/hideMenu");
    },
    openHelp() {
      let url = "https://otp.ee/chromeissues";

      if (navigator.userAgent.indexOf("Firefox") !== -1) {
        url = "https://otp.ee/firefoxissues";
      } else if (navigator.userAgent.indexOf("Edg") !== -1) {
        url = "https://otp.ee/edgeissues";
      }

      const feedbackURL = this.$store.state.menu.feedbackURL;
      if (typeof feedbackURL === "string" && feedbackURL) {
        url = feedbackURL;
      }

      chrome.tabs.create({ url });
    },
    openLink(url: string) {
      window.open(url, "_blank");
      return;
    },
    showInfo(tab: string) {
      if (this.$store.getters["accounts/currentlyEncrypted"]) {
        if (tab === "SetPasswordPage") {
          this.$store.commit("notification/alert", this.i18n.phrase_incorrect);
          return;
        }
      }
      this.$store.commit("style/showInfo");
      this.$store.commit("currentView/changeView", tab);
      return;
    },
    showBackup() {
      this.$store.commit("style/showBackupPanel");
    },
    syncClock() {
      chrome.permissions.request(
        { origins: ["https://www.google.com/"] },
        async (granted) => {
          if (granted) {
            await UserSettings.updateItems();
            const message = await syncTimeWithGoogle();
            this.$store.commit("notification/alert", this.i18n[message]);
          }
          return;
        }
      );
      return;
    },
  },
});
</script>
