<template>
  <div id="info">
    <button
      id="infoClose"
      type="button"
      v-if="!(info === 'EnterPasswordPage' || info === 'LoadingPage')"
      :title="isNavigationPage ? i18n.back : i18n.close"
      :aria-label="isNavigationPage ? i18n.back : i18n.close"
      @click="handleExit"
    >
      <IconArrowLeft v-if="isNavigationPage" />
      <IconXCircle v-else />
    </button>
    <component v-bind:is="info" id="infoContent"></component>
  </div>
</template>
<script lang="ts">
import Vue from "vue";

import IconArrowLeft from "../../../svg/arrow-left.svg";
import IconXCircle from "../../../svg/x-circle.svg";

import AddAccountPage from "./AddAccountPage.vue";
import AddMethodPage from "./AddMethodPage.vue";
import SetPasswordPage from "./SetPasswordPage.vue";
import EnterPasswordPage from "./EnterPasswordPage.vue";
import PreferencesPage from "./PreferencesPage.vue";
import AdvisorPage from "./AdvisorPage.vue";
import LoadingPage from "./LoadingPage.vue";
import GroupsPage from "./GroupsPage.vue";

const navigationPages = [
  "AddAccountPage",
  "AdvisorPage",
  "GroupsPage",
  "PreferencesPage",
  "SetPasswordPage",
];

export default Vue.extend({
  computed: {
    info: function () {
      return this.$store.state.currentView.info;
    },
    isNavigationPage(): boolean {
      return navigationPages.includes(this.info);
    },
  },
  methods: {
    handleExit() {
      if (this.info === "AddAccountPage") {
        this.$store.commit("currentView/changeView", "AddMethodPage");
        return;
      }
      this.hideInfo();
    },
    hideInfo() {
      this.$store.commit("style/hideInfo");
    },
  },
  components: {
    IconArrowLeft,
    IconXCircle,
    AddAccountPage,
    AddMethodPage,
    SetPasswordPage,
    EnterPasswordPage,
    PreferencesPage,
    AdvisorPage,
    LoadingPage,
    GroupsPage,
  },
});
</script>
