<template>
  <div
    id="codes"
    v-bind:class="{ filter: shouldFilter && filter, search: showSearch }"
  >
    <div class="entry-count" v-show="showSearch">
      {{ i18n.total_entries || "Entries" }}: {{ visibleEntriesCount }} /
      {{ totalEntriesCount }}
    </div>

    <div class="under-header" id="filter" v-on:click="clearFilter()">
      {{ i18n.show_all_entries }}
    </div>
    <div class="under-header" id="search">
      <input
        id="searchInput"
        ref="searchInput"
        v-model="searchText"
        v-bind:placeholder="i18n.search"
        type="text"
        tabindex="-1"
      />
      <button
        v-if="searchText !== ''"
        type="button"
        class="search-clear-btn"
        title="清空搜索"
        v-on:click.stop="clearSearch()"
      >
        <IconXCircle />
      </button>
      <div id="searchHint" v-if="searchText === ''">
        <div id="searchHintBorder">/</div>
      </div>
    </div>

    <div class="group-toolbar">
      <label class="group-filter-label" for="groupFilterSelect">
        {{ groupLabel }}
      </label>
      <select
        id="groupFilterSelect"
        class="group-filter-select"
        :value="activeGroupId"
        @change="onGroupFilterChange"
      >
        <option value="__all__">
          {{ allGroupsLabel }}（{{ entries.length }}）
        </option>
        <option
          v-if="ungroupedTotalCount > 0 || activeGroupId === '__ungrouped__'"
          value="__ungrouped__"
        >
          {{ ungroupedLabel }}（{{ ungroupedTotalCount }}）
        </option>
        <option v-for="group in groups" :key="group.id" :value="group.id">
          {{ group.name }}（{{ getGroupTotal(group.id) }}）
        </option>
      </select>
      <button
        type="button"
        class="group-manage-btn"
        :title="createGroupLabel"
        v-on:click="openGroupManager()"
      >
        <IconBars />
      </button>
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
      v-dragula
      drake="entryDrake"
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
        v-on:toggle-select="toggleSelect(entry.hash)"
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
      <div class="batch-top-row">
        <div class="batch-select-all" v-on:click="toggleSelectAll()">
          <div
            v-bind:class="{ 'checkbox-inner': true, checked: isAllSelected }"
          >
            <IconCheck v-if="isAllSelected" />
          </div>
          <span>{{ isAllSelected ? deselectAllLabel : selectAllLabel }}</span>
        </div>
      </div>
      <div class="batch-bottom-row">
        <div class="batch-group-move">
          <select v-model="targetGroupId">
            <option value="">{{ ungroupedShortLabel }}</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select>
          <button
            class="batch-assign-btn"
            v-bind:disabled="selectedHashes.size === 0"
            v-on:click="moveSelectedToGroup()"
          >
            {{ moveLabel }}
          </button>
          <button
            class="batch-delete-btn"
            v-bind:disabled="selectedHashes.size === 0"
            v-on:click="batchDelete()"
          >
            {{ deleteLabel }}（{{ selectedHashes.size }}）
          </button>
        </div>
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
import IconBars from "../../../svg/bars.svg";
import IconKey from "../../../svg/key-solid.svg";
import IconCheck from "../../../svg/check.svg";
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
    ungroupedTotalCount(): number {
      return this.entries.filter((entry) => !entry.groupId).length;
    },
    groupLabel(): string {
      return "分组";
    },
    allGroupsLabel(): string {
      return "全部";
    },
    ungroupedLabel(): string {
      return "未分组";
    },
    createGroupLabel(): string {
      return "编辑分组";
    },
    selectAllLabel(): string {
      return this.i18n.select_all || "全选";
    },
    deselectAllLabel(): string {
      return this.i18n.deselect_all || "取消全选";
    },
    ungroupedShortLabel(): string {
      return this.i18n.group_ungrouped || "未分组";
    },
    moveLabel(): string {
      return this.i18n.group_move || "移动";
    },
    deleteLabel(): string {
      return this.i18n.delete || "删除";
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
      return this.i18n.group_empty || "No entries in this group.";
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
    },
    onGroupFilterChange(event: Event) {
      const target = event.target as HTMLSelectElement | null;
      if (!target) {
        return;
      }
      this.setActiveGroup(target.value);
    },
    getGroupTotal(groupId: string) {
      return this.entries.filter((entry) => entry.groupId === groupId).length;
    },
    isMatchedEntry(entry: OTPEntry) {
      for (const hash of this.$store.getters["accounts/matchedEntries"]) {
        if (entry.hash === hash) {
          return true;
        }
      }
      return false;
    },
    isSearchedEntry(entry: OTPEntry) {
      if (this.searchText === "") {
        return true;
      }
      return (
        entry.issuer.toLowerCase().includes(this.searchText.toLowerCase()) ||
        entry.account.toLowerCase().includes(this.searchText.toLowerCase())
      );
    },
    clearFilter() {
      this.$store.dispatch("accounts/clearFilter");
    },
    clearSearch() {
      this.searchText = "";
      this.$nextTick(() => {
        const input = this.$refs.searchInput as HTMLInputElement | undefined;
        input?.focus();
      });
    },
    toggleSelect(hash: string) {
      const newSet = new Set(this.selectedHashes);
      if (newSet.has(hash)) {
        newSet.delete(hash);
      } else {
        newSet.add(hash);
      }
      this.selectedHashes = newSet;
    },
    toggleSelectAll() {
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
        for (const hash of this.selectedHashes) {
          const entry = this.entries.find((e) => e.hash === hash);
          if (entry) {
            await entry.delete();
          }
        }
        await this.$store.dispatch(
          "accounts/batchDeleteCode",
          Array.from(this.selectedHashes)
        );
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
        document.querySelectorAll<HTMLAnchorElement>(".entry-list .entry")
      ).filter((entry) => entry.offsetParent !== null);
    },
    findNextEntryIndex(reverse: boolean) {
      const visibleElements = this.getVisibleEntryElements();
      if (
        !document.activeElement ||
        !visibleElements.includes(document.activeElement as HTMLAnchorElement)
      ) {
        return -1;
      }

      const activeIndex = visibleElements.indexOf(
        document.activeElement as HTMLAnchorElement
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
  created() {
    this.$dragula.$service.options("entryDrake", {
      invalid: () => {
        if (!this.$store.state.style.style.isEditing) {
          return true;
        } else {
          return false;
        }
      },
    });

    this.$dragula.$service.eventBus.$on(
      "dropModel",
      async ({
        dragIndex,
        dropIndex,
      }: {
        dragIndex: number;
        dropIndex: number;
      }) => {
        if (this.activeGroupId !== "__all__" || this.searchText) {
          return;
        }
        this.$store.commit("accounts/moveCode", {
          from: dragIndex,
          to: dropIndex,
        });
        await EntryStorage.set(this.$store.state.accounts.entries);
      }
    );
  },
  components: {
    EntryComponent,
    IconKey,
    IconCheck,
    IconBars,
    IconXCircle,
  },
});
</script>
