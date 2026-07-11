<template>
  <div class="entry-tools">
    <div class="entry-actions-row">
      <button
        type="button"
        class="showqr"
        v-if="showExportActions"
        :title="i18n.ui_show_qr"
        :aria-label="i18n.ui_show_qr"
        @click.stop="$emit('show-qr')"
      >
        <IconQr />
      </button>
      <button
        type="button"
        class="copyotpauth"
        v-if="showExportActions"
        :title="i18n.ui_copy_otp_link"
        :aria-label="i18n.ui_copy_otp_link"
        @click.stop="$emit('copy-otp')"
      >
        <IconClipboardCheck />
      </button>
      <button
        type="button"
        :class="{ pin: true, pinned: entry.pinned }"
        :title="entry.pinned ? i18n.ui_unpin : i18n.ui_pin"
        :aria-label="entry.pinned ? i18n.ui_unpin : i18n.ui_pin"
        @click.stop="$emit('pin')"
      >
        <IconPin />
      </button>
      <button
        type="button"
        class="entry-view-trigger"
        :title="i18n.ui_view_otp"
        :aria-label="i18n.ui_view_otp"
        @click.stop="$emit('view-details')"
      >
        <IconInfo />
      </button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { OTPEntry } from "../../models/otp";
import IconQr from "../../../svg/qrcode.svg";
import IconClipboardCheck from "../../../svg/clipboard-check.svg";
import IconPin from "../../../svg/pin.svg";
import IconInfo from "../../../svg/info.svg";

export default Vue.extend({
  props: {
    entry: {
      type: Object as () => OTPEntry,
      required: true,
    },
    showExportActions: {
      type: Boolean,
      default: false,
    },
  },
  components: {
    IconQr,
    IconClipboardCheck,
    IconPin,
    IconInfo,
  },
});
</script>
