<template>
  <div>
    <!-- MESSAGE -->
    <div
      class="message-box"
      role="alertdialog"
      aria-modal="true"
      v-show="message.length && messageIdle"
    >
      <div class="notification-dialog-message">
        {{ message.length ? message[0] : "" }}
      </div>
      <div class="notification-dialog-actions">
        <button
          type="button"
          class="subpage-button primary"
          @click="closeAlert()"
        >
          {{ i18n.ok }}
        </button>
      </div>
    </div>

    <!-- CONFIRM -->
    <div
      class="message-box"
      role="alertdialog"
      aria-modal="true"
      v-show="confirmMessage !== ''"
    >
      <div class="notification-dialog-message">{{ confirmMessage }}</div>
      <div class="notification-dialog-actions">
        <button type="button" class="subpage-button" @click="confirmCancel()">
          {{ i18n.no }}
        </button>
        <button
          type="button"
          class="subpage-button primary"
          @click="confirmOK()"
        >
          {{ i18n.yes }}
        </button>
      </div>
    </div>

    <!-- OVERLAY -->
    <div
      id="overlay"
      class="notification-overlay"
      v-show="(message.length && messageIdle) || confirmMessage !== ''"
    ></div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState } from "vuex";

export default Vue.extend({
  computed: mapState("notification", [
    "message",
    "messageIdle",
    "confirmMessage",
  ]),
  methods: {
    closeAlert() {
      this.$store.commit("notification/closeAlert");
    },
    confirmOK() {
      const confirmEvent = new CustomEvent("confirm", { detail: true });
      window.dispatchEvent(confirmEvent);
      return;
    },
    confirmCancel() {
      const confirmEvent = new CustomEvent("confirm", { detail: false });
      window.dispatchEvent(confirmEvent);
      return;
    },
  },
});
</script>
