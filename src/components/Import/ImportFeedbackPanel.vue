<template>
  <div class="import-feedback-panel" v-if="showProgress || summaryMessage">
    <div
      v-if="showProgress"
      class="import-progress-card"
      :class="{ active: inProgress }"
    >
      <div class="import-progress-head">
        <span class="import-progress-title">
          {{ inProgress ? progressTitle : i18n.ui_import_progress }}
        </span>
        <div class="import-progress-actions">
          <span class="import-progress-value">{{ progressValue }}%</span>
          <button
            type="button"
            class="import-cancel-button"
            v-if="showCancel && inProgress"
            @click="$emit('cancel')"
          >
            {{ i18n.ui_cancel_import }}
          </button>
        </div>
      </div>
      <div
        class="import-progress-bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="progressValue"
        :aria-label="progressLabel"
      >
        <div
          class="import-progress-fill"
          :style="{ width: progressValue + '%' }"
        ></div>
      </div>
      <div class="import-progress-label">{{ progressLabel }}</div>
    </div>

    <div
      v-if="summaryMessage"
      :class="['import-result-card', summaryTone]"
      role="status"
    >
      <div class="import-result-title">{{ summaryTitle }}</div>
      <pre class="import-result-text">{{ summaryMessage }}</pre>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  props: {
    showProgress: Boolean,
    inProgress: Boolean,
    progressValue: {
      type: Number,
      default: 0,
    },
    progressLabel: {
      type: String,
      default: "",
    },
    progressTitle: {
      type: String,
      default: "Importing backup",
    },
    summaryTitle: {
      type: String,
      default: "",
    },
    summaryMessage: {
      type: String,
      default: "",
    },
    summaryTone: {
      type: String,
      default: "",
    },
    showCancel: Boolean,
  },
});
</script>
