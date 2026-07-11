<template>
  <div class="subpage advisor-page">
    <div class="subpage-head">
      <div class="subpage-title">{{ i18n.advisor }}</div>
      <div class="subpage-subtitle">
        {{ i18n.ui_advisor_subtitle }}
      </div>
    </div>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_check_results }}</div>
        <button
          v-if="ignoreList.length > 0"
          type="button"
          class="subpage-section-action"
          @click="clearIgnoreList"
        >
          {{ i18n.ui_show_ignored }}
        </button>
        <span v-else class="subpage-section-meta">
          {{ insights.length }} {{ i18n.ui_items }}
        </span>
      </div>

      <div v-if="insights.length > 0" class="subpage-list-card">
        <AdvisorInsight
          v-for="insight in insights"
          :key="insight.id"
          :insight="insight"
        />
      </div>

      <div v-else class="subpage-empty">
        <span class="subpage-row-icon success"><IconCheck /></span>
        <div class="subpage-empty-title">{{ i18n.ui_settings_good }}</div>
        <div class="subpage-empty-desc">
          {{
            i18n.no_insight_available ||
            "No security recommendations need attention."
          }}
        </div>
      </div>
    </section>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import AdvisorInsight from "./AdvisorInsight.vue";
import IconCheck from "../../../svg/check.svg";

export default Vue.extend({
  mounted: function () {
    this.$store.commit("advisor/updateInsight");
  },
  computed: {
    insights: function () {
      return this.$store.state.advisor.insights;
    },
    ignoreList: function () {
      return this.$store.state.advisor.ignoreList;
    },
  },
  components: {
    AdvisorInsight,
    IconCheck,
  },
  methods: {
    clearIgnoreList: function () {
      this.$store.commit("advisor/clearIgnoreList");
    },
  },
});
</script>
