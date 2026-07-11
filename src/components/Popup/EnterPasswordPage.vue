<template>
  <div v-on:keydown.stop>
    <div class="text">
      {{
        unresolvedKeyCount > 0
          ? i18n.ui_additional_password_required
          : i18n.passphrase_info
      }}
    </div>
    <a-text-input
      type="password"
      v-model="password"
      @enter="applyPassphrase()"
      :class="{ badInput: wrongPassword }"
      :autofocus="true"
    />
    <label class="warning" v-show="wrongPassword">{{
      i18n.phrase_not_match
    }}</label>
    <label class="warning" v-show="unresolvedKeyCount > 0">
      {{ i18n.ui_remaining_encryption_keys }}: {{ unresolvedKeyCount }}
    </label>
    <a-button type="small" @click="applyPassphrase()">{{ i18n.ok }}</a-button>
  </div>
</template>
<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  data: function () {
    return {
      password: "",
    };
  },
  computed: {
    wrongPassword() {
      return this.$store.state.accounts.wrongPassword;
    },
    unresolvedKeyCount() {
      return this.$store.state.accounts.unresolvedKeyCount || 0;
    },
  },
  methods: {
    async applyPassphrase() {
      await this.$store.dispatch("accounts/applyPassphrase", this.password);
      const firstEntry = document.querySelector(
        ".entry[tabindex='0']"
      ) as HTMLElement;
      firstEntry?.focus();
    },
  },
});
</script>
