<template>
  <div
    id="codes"
    v-bind:class="{
      filter: shouldFilter && filter,
      search: showSearch,
      'batch-selecting': style.isSelecting,
    }"
    v-on:scroll.passive="closeAllSwipe()"
  >
    <div class="vault-controls">
      <div class="entry-count" v-if="initComplete">
        <span class="entry-count-title">{{ i18n.ui_otp_codes }}</span>
        <span class="entry-count-value">{{ entryCountLabel }}</span>
      </div>

      <div class="under-header" id="filter" v-on:click="clearFilter()">
        {{ i18n.show_all_entries }}
      </div>
      <div class="under-header" id="search" v-show="showSearch">
        <input
          id="searchInput"
          ref="searchInput"
          v-model="searchText"
          v-bind:placeholder="i18n.search"
          type="text"
          tabindex="0"
        />
        <button
          v-if="searchText !== ''"
          type="button"
          class="search-clear-btn"
          :title="i18n.ui_clear_search"
          :aria-label="i18n.ui_clear_search"
          v-on:click.stop="clearSearch()"
        >
          <IconXCircle />
        </button>
        <div id="searchHint" v-if="searchText === ''">
          <div id="searchHintBorder">/</div>
        </div>
      </div>

      <GroupFilterToolbar
        :groups="groups"
        :active-group-id="activeGroupId"
        :total-count="entries.length"
        :ungrouped-count="ungroupedTotalCount"
        :group-counts="groupCounts"
        @change="setActiveGroup"
        @manage="openGroupManager"
      />
    </div>

    <div
      class="empty-state-card"
      v-if="entries.length > 0 && visibleEntriesCount === 0 && initComplete"
    >
      <strong>{{ activeGroupEmptyTitle }}</strong>
      <p>{{ activeGroupEmptyMessage }}</p>
    </div>

    <div
      class="entry-list"
      v-on:keydown.down="focusNextEntry()"
      v-on:keydown.right="focusNextEntry()"
      v-on:keydown.up="focusLastEntry()"
      v-on:keydown.left="focusLastEntry()"
    >
      <EntryComponent
        v-for="entry in visibleEntries"
        :key="entry.hash"
        v-bind:filtered="!entry.pinned && !isMatchedEntry(entry)"
        v-bind:notSearched="!isSearchedEntry(entry)"
        v-bind:entry="entry"
        v-bind:tabindex="getTabindex(entry)"
        v-bind:selected="selectedHashes.has(entry.hash)"
        v-bind:swipe-open="openSwipeHash === entry.hash"
        v-on:toggle-select="toggleSelect(entry.hash)"
        v-on:open-swipe="openSwipe(entry.hash)"
        v-on:close-swipe="closeSwipe(entry.hash)"
      />
    </div>

    <div class="no-entry" v-if="entries.length === 0 && initComplete">
      <IconKey />
      <p>
        {{ i18n.no_entires }}
        <a href="#" v-on:click="openLink('https://otp.ee/quickstart')">{{
          i18n.learn_more
        }}</a>
      </p>
    </div>

    <div class="batch-bar" v-if="style.isSelecting">
      <div class="batch-summary-row">
        <button type="button" class="batch-select-all" @click="toggleSelectAll">
          <div
            v-bind:class="{ 'checkbox-inner': true, checked: isAllSelected }"
          >
            <IconCheck v-if="isAllSelected" />
          </div>
          <span class="batch-selection-copy">
            <strong>{{ batchSelectionTitle }}</strong>
          </span>
          <span class="batch-select-action">
            {{ isAllSelected ? deselectAllLabel : selectAllLabel }}
          </span>
        </button>
      </div>

      <div class="batch-actions-line">
        <select
          id="batchGroupSelect"
          v-model="targetGroupId"
          :aria-label="i18n.ui_target_group"
        >
          <option value="">{{ ungroupedShortLabel }}</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </option>
        </select>
        <button
          type="button"
          class="batch-action-btn move"
          :disabled="selectedHashes.size === 0"
          @click="moveSelectedToGroup"
        >
          <IconExchange />
          <span>{{ moveLabel }}</span>
        </button>
        <button
          type="button"
          class="batch-action-btn delete"
          :disabled="selectedHashes.size === 0"
          @click="batchDelete"
        >
          <IconXCircle />
          <span>{{ deleteLabel }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState, mapGetters } from "vuex";
import { OTPEntry } from "../../models/otp";
import { EntryStorage } from "../../models/storage";

import EntryComponent from "./EntryComponent.vue";
import GroupFilterToolbar from "./GroupFilterToolbar.vue";
import IconKey from "../../../svg/key-solid.svg";
import IconCheck from "../../../svg/check.svg";
import IconExchange from "../../../svg/exchange.svg";
import IconXCircle from "../../../svg/x-circle.svg";

const computed: {
  filter: () => boolean;
  showSearch: () => boolean;
  shouldFilter: () => boolean;
  entries: () => OTPEntry[];
  style: () => StyleState["style"];
  initComplete: () => boolean;
} = {
  ...mapState("accounts", ["filter", "showSearch", "initComplete"]),
  ...mapState("style", ["style"]),
  ...mapGetters("accounts", ["shouldFilter", "entries"]),
};

export default Vue.extend({
  data: function () {
    return {
      searchText: "",
      selectedHashes: new Set() as Set<string>,
      targetGroupId: "",
      openSwipeHash: "",
    };
  },
  computed: {
    ...computed,
    groups(): OTPGroupInterface[] {
      return this.$store.state.groups.groups;
    },
    activeGroupId(): string {
      return this.$store.state.groups.activeGroupId || "__all__";
    },
    groupCounts(): Record<string, number> {
      return this.entries.reduce((counts: Record<string, number>, entry) => {
        const groupId = entry.groupId || "__ungrouped__";
        counts[groupId] = (counts[groupId] || 0) + 1;
        return counts;
      }, {});
    },
    ungroupedTotalCount(): number {
      return this.groupCounts.__ungrouped__ || 0;
    },
    normalizedSearchText(): string {
      return this.searchText.trim().toLowerCase();
    },
    matchedEntryHashes(): Set<string> {
      return new Set(this.$store.getters["accounts/matchedEntries"]);
    },
    selectAllLabel(): string {
      return this.i18n.select_all || "Select all";
    },
    deselectAllLabel(): string {
      return this.i18n.deselect_all || "Deselect all";
    },
    ungroupedShortLabel(): string {
      return this.i18n.group_ungrouped || "Ungrouped";
    },
    moveLabel(): string {
      return this.i18n.group_move || "Move";
    },
    deleteLabel(): string {
      return this.i18n.delete || "Delete";
    },
    batchSelectionTitle(): string {
      return this.selectedHashes.size > 0
        ? `${this.i18n.ui_selected} ${this.selectedHashes.size} ${this.i18n.ui_items}`
        : this.i18n.ui_no_selection;
    },
    visibleEntries(): OTPEntry[] {
      return this.entries.filter((entry) => {
        if (!this.isEntryVisible(entry)) {
          return false;
        }

        if (this.activeGroupId === "__all__") {
          return true;
        }

        if (this.activeGroupId === "__ungrouped__") {
          return !entry.groupId;
        }

        return entry.groupId === this.activeGroupId;
      });
    },
    visibleEntriesCount(): number {
      return this.visibleEntries.length;
    },
    totalEntriesCount(): number {
      return this.entries.length;
    },
    entryCountLabel(): string {
      if (this.visibleEntriesCount === this.totalEntriesCount) {
        return `${this.totalEntriesCount} ${this.i18n.ui_items}`;
      }
      return `${this.visibleEntriesCount} / ${this.totalEntriesCount} ${this.i18n.ui_items}`;
    },
    isAllSelected(): boolean {
      return (
        this.visibleEntries.length > 0 &&
        this.visibleEntries.every((entry) =>
          (this.selectedHashes as Set<string>).has(entry.hash)
        )
      );
    },
    activeGroupLabel(): string {
      if (this.activeGroupId === "__all__") {
        return this.i18n.group_all || "All";
      }
      if (this.activeGroupId === "__ungrouped__") {
        return this.i18n.group_ungrouped || "Ungrouped";
      }
      return (
        this.groups.find((group) => group.id === this.activeGroupId)?.name ||
        this.i18n.group_ungrouped ||
        "Ungrouped"
      );
    },
    activeGroupEmptyTitle(): string {
      if (this.searchText) {
        return this.i18n.search || "Search";
      }
      return this.activeGroupLabel;
    },
    activeGroupEmptyMessage(): string {
      if (this.searchText) {
        return this.i18n.no_results || "No matching entries found.";
      }
      return this.i18n.group_empty || "This group has no entries yet.";
    },
  },
  watch: {
    "style.isSelecting"(isSelecting: boolean) {
      if (!isSelecting) {
        this.selectedHashes = new Set();
        this.targetGroupId = "";
        this.openSwipeHash = "";
      }
    },
    searchText() {
      this.selectedHashes = new Set();
      this.openSwipeHash = "";
    },
    entries(entries: OTPEntry[]) {
      const existingHashes = new Set(entries.map((entry) => entry.hash));
      this.selectedHashes = new Set(
        Array.from(this.selectedHashes).filter((hash) =>
          existingHashes.has(hash)
        )
      );
    },
  },
  methods: {
    openLink(url: string) {
      window.open(url, "_blank");
      return;
    },
    openGroupManager() {
      this.$store.commit("style/showInfo");
      this.$store.commit("currentView/changeView", "GroupsPage");
    },
    setActiveGroup(groupId: string) {
      this.$store.commit("groups/setActiveGroup", groupId);
      this.selectedHashes = new Set();
      this.openSwipeHash = "";
    },
    isMatchedEntry(entry: OTPEntry) {
      return this.matchedEntryHashes.has(entry.hash);
    },
    isSearchedEntry(entry: OTPEntry) {
      if (!this.normalizedSearchText) {
        return true;
      }
      return (
        entry.issuer.toLowerCase().includes(this.normalizedSearchText) ||
        entry.account.toLowerCase().includes(this.normalizedSearchText) ||
        (entry.note || "").toLowerCase().includes(this.normalizedSearchText)
      );
    },
    clearFilter() {
      this.$store.dispatch("accounts/clearFilter");
    },
    clearSearch() {
      this.searchText = "";
      this.openSwipeHash = "";
      this.$nextTick(() => {
        const input = this.$refs.searchInput as HTMLInputElement | undefined;
        input?.focus();
      });
    },
    toggleSelect(hash: string) {
      this.openSwipeHash = "";
      const newSet = new Set(this.selectedHashes);
      if (newSet.has(hash)) {
        newSet.delete(hash);
      } else {
        newSet.add(hash);
      }
      this.selectedHashes = newSet;
    },
    toggleSelectAll() {
      this.openSwipeHash = "";
      if (this.isAllSelected) {
        this.selectedHashes = new Set();
      } else {
        this.selectedHashes = new Set(
          this.visibleEntries.map((entry) => entry.hash)
        );
      }
    },
    async moveSelectedToGroup() {
      if (this.selectedHashes.size === 0) {
        return;
      }

      await this.$store.dispatch("accounts/assignGroupBatch", {
        hashes: Array.from(this.selectedHashes),
        groupId: this.targetGroupId || undefined,
      });
      this.selectedHashes = new Set();
    },
    openSwipe(hash: string) {
      this.openSwipeHash = hash;
    },
    closeSwipe(hash: string) {
      if (this.openSwipeHash === hash) {
        this.openSwipeHash = "";
      }
    },
    closeAllSwipe() {
      this.openSwipeHash = "";
    },
    async batchDelete() {
      const count = this.selectedHashes.size;
      if (count === 0) {
        return;
      }
      if (
        await this.$store.dispatch(
          "notification/confirm",
          (this.i18n.confirm_delete || "Delete") + " (" + count + ")"
        )
      ) {
        const hashes = Array.from(this.selectedHashes);
        await EntryStorage.removeMany(hashes);
        await this.$store.dispatch("accounts/batchDeleteCode", hashes);
        this.selectedHashes = new Set();
      }
    },
    isEntryVisible(entry: OTPEntry) {
      return (
        this.isSearchedEntry(entry) &&
        (entry.pinned ||
          !this.shouldFilter ||
          !this.filter ||
          this.isMatchedEntry(entry))
      );
    },
    getTabindex(entry: OTPEntry) {
      const firstEntry = this.visibleEntries[0];
      return entry === firstEntry ? 0 : -1;
    },
    getVisibleEntryElements() {
      return Array.from(
        document.querySelectorAll<HTMLElement>(".entry-list .entry")
      ).filter((entry) => entry.offsetParent !== null);
    },
    findNextEntryIndex(reverse: boolean) {
      const visibleElements = this.getVisibleEntryElements();
      if (
        !document.activeElement ||
        !visibleElements.includes(document.activeElement as HTMLElement)
      ) {
        return -1;
      }

      const activeIndex = visibleElements.indexOf(
        document.activeElement as HTMLElement
      );
      if (activeIndex === -1) {
        return -1;
      }

      if (!reverse) {
        return activeIndex + 1 >= visibleElements.length ? 0 : activeIndex + 1;
      }

      return activeIndex - 1 < 0 ? visibleElements.length - 1 : activeIndex - 1;
    },
    focusNextEntry() {
      const nextIndex = this.findNextEntryIndex(false);
      if (nextIndex < 0) {
        return;
      }
      this.getVisibleEntryElements()[nextIndex]?.focus();
    },
    focusLastEntry() {
      const nextIndex = this.findNextEntryIndex(true);
      if (nextIndex < 0) {
        return;
      }
      this.getVisibleEntryElements()[nextIndex]?.focus();
    },
  },
  components: {
    EntryComponent,
    GroupFilterToolbar,
    IconKey,
    IconCheck,
    IconExchange,
    IconXCircle,
  },
});
</script>
