<template>
  <article class="advisor-insight-row">
    <div class="advisor-insight-main">
      <span :class="['subpage-row-icon', insight.level]">
        <IconAdvisor />
      </span>
      <div class="subpage-row-copy">
        <div class="subpage-row-title">
          {{ insight.levelText || levelFallback }}
        </div>
        <div class="subpage-row-desc">{{ insight.description }}</div>
      </div>
    </div>
    <div class="advisor-insight-actions">
      <button
        v-if="insight.link"
        type="button"
        class="advisor-insight-action"
        @click="openLink(insight.link)"
      >
        {{ i18n.learn_more || "Learn more" }}
      </button>
      <button
        type="button"
        class="advisor-insight-action"
        @click="dismiss(insight)"
      >
        {{ i18n.dismiss || "Dismiss" }}
      </button>
    </div>
  </article>
</template>
<script lang="ts">
import Vue from "vue";
import { AdvisorInsight } from "../../models/advisor";
import IconAdvisor from "../../../svg/lightbulb.svg";

export default Vue.extend({
  components: {
    IconAdvisor,
  },
  props: {
    insight: AdvisorInsight,
  },
  computed: {
    levelFallback(): string {
      if (this.insight.level === "danger") {
        return this.i18n.danger || "Danger";
      }
      if (this.insight.level === "warning") {
        return this.i18n.warning || "Warning";
      }
      return this.i18n.info || "Recommendation";
    },
  },
  methods: {
    dismiss(insight: AdvisorInsight) {
      this.$store.commit("advisor/dismissInsight", insight.id);
    },
    openLink(url: string) {
      window.open(url, "_blank");
      return;
    },
  },
});
</script>
