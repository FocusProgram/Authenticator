<template>
  <div class="subpage security-page">
    <div class="subpage-head">
      <div class="subpage-title">{{ i18n.ui_security_title }}</div>
      <div class="subpage-subtitle">
        {{ i18n.ui_security_subtitle }}
      </div>
    </div>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">
          {{ i18n.ui_password_protection }}
        </div>
      </div>
      <div class="subpage-notice">
        <span class="subpage-row-icon warning"><IconLock /></span>
        <div>
          <div class="subpage-notice-title">
            {{ i18n.ui_password_warning_title }}
          </div>
          <div class="subpage-notice-desc">
            {{
              i18n.security_warning ||
              "Encrypted data cannot be recovered if the master password is lost."
            }}
          </div>
        </div>
      </div>
    </section>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">
          {{
            defaultEncryption
              ? i18n.ui_change_master_password
              : i18n.ui_set_master_password
          }}
        </div>
      </div>
      <form
        class="subpage-card subpage-form-card"
        @submit.prevent="changePassphrase"
      >
        <label class="subpage-field" v-if="defaultEncryption">
          <span class="subpage-field-label">
            {{ i18n.current_phrase || "Current password" }}
          </span>
          <input
            class="subpage-text-input"
            type="password"
            v-model="currentPhrase"
            autocomplete="current-password"
          />
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">
            {{
              defaultEncryption
                ? i18n.new_phrase || "New password"
                : i18n.ui_master_password
            }}
          </span>
          <input
            class="subpage-text-input"
            type="password"
            v-model="phrase"
            autocomplete="new-password"
          />
          <span class="subpage-field-help" v-if="passwordPolicyHint">
            {{ passwordPolicyHint }}
          </span>
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">
            {{ i18n.confirm_phrase || "Confirm password" }}
          </span>
          <input
            class="subpage-text-input"
            type="password"
            v-model="confirm"
            autocomplete="new-password"
          />
        </label>

        <div class="subpage-actions security-actions">
          <button
            v-if="defaultEncryption && !enforcePassword"
            id="security-remove"
            class="subpage-button danger"
            type="button"
            @click="removePassphrase"
          >
            {{ i18n.remove || "Remove password" }}
          </button>
          <button
            id="security-save"
            class="subpage-button primary"
            type="submit"
          >
            {{ i18n.save || i18n.ok }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { verifyPasswordUsingKeyID } from "../../models/password";
import IconLock from "../../../svg/lock.svg";

export default Vue.extend({
  components: {
    IconLock,
  },
  data: function () {
    return {
      phrase: "",
      currentPhrase: "",
      confirm: "",
    };
  },
  computed: {
    enforcePassword: function () {
      return this.$store.state.menu.enforcePassword;
    },
    passwordPolicy: function () {
      if (!this.$store.state.menu.passwordPolicy) {
        return null;
      }

      try {
        return new RegExp(this.$store.state.menu.passwordPolicy);
      } catch {
        console.warn(
          "Invalid password policy. The password policy is not a valid regular expression.",
          this.$store.state.menu.passwordPolicy
        );
        return null;
      }
    },
    passwordPolicyHint: function () {
      return this.$store.state.menu.passwordPolicyHint;
    },
    defaultEncryption: function (): string | undefined {
      return this.$store.state.accounts.defaultEncryption;
    },
  },
  methods: {
    async removePassphrase() {
      this.$store.commit("currentView/changeView", "LoadingPage");

      if (this.defaultEncryption) {
        const isCorrectPassword = await verifyPasswordUsingKeyID(
          this.defaultEncryption,
          this.currentPhrase
        );
        if (!isCorrectPassword) {
          this.$store.commit("notification/alert", this.i18n.phrase_not_match);
          this.$store.commit("currentView/changeView", "SetPasswordPage");
          return;
        }
      }

      await this.$store.dispatch("accounts/changePassphrase", "");
      this.$store.commit("notification/alert", this.i18n.updateSuccess);
      this.$store.commit("style/hideInfo");
      return;
    },
    async changePassphrase() {
      if (this.phrase === "") {
        return;
      }

      if (this.passwordPolicy && !this.passwordPolicy.test(this.phrase)) {
        const hint =
          this.passwordPolicyHint || this.i18n.password_policy_default_hint;
        this.$store.commit("notification/alert", hint);
        return;
      }

      if (this.phrase !== this.confirm) {
        this.$store.commit("notification/alert", this.i18n.phrase_not_match);
        return;
      }

      this.$store.commit("currentView/changeView", "LoadingPage");

      if (this.defaultEncryption) {
        const isCorrectPassword = await verifyPasswordUsingKeyID(
          this.defaultEncryption,
          this.currentPhrase
        );
        if (!isCorrectPassword) {
          this.$store.commit("notification/alert", this.i18n.phrase_wrong);
          this.$store.commit("currentView/changeView", "SetPasswordPage");
          return;
        }
      }

      await this.$store.dispatch("accounts/changePassphrase", this.phrase);
      this.$store.commit("notification/alert", this.i18n.updateSuccess);
      this.$store.commit("style/hideInfo");
      return;
    },
  },
});
</script>
