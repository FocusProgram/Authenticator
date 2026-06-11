<template>
  <div
    id="codes"
    v-bind:class="{ filter: shouldFilter && filter, search: showSearch }"
  >
    <!-- Filter -->
    <div class="under-header" id="filter" v-on:click="clearFilter()">
      {{ i18n.show_all_entries }}
    </div>
    <!-- Entry Count -->
    <div class="entry-count" v-show="showSearch">
      {{ i18n.total_entries }}: {{ visibleEntriesCount }} /
      {{ totalEntriesCount }}
    </div>
    <!-- Search -->
    <div class="under-header" id="search">
      <input
        id="searchInput"
        v-model="searchText"
        v-bind:placeholder="i18n.search"
        type="text"
        tabindex="-1"
      />
      <div id="searchHint" v-if="searchText === ''">
        <div id="searchHintBorder">/</div>
      </div>
    </div>
    <!-- Entries -->
    <div
      v-dragula
      drake="entryDrake"
      v-on:keydown.down="focusNextEntry()"
      v-on:keydown.right="focusNextEntry()"
      v-on:keydown.up="focusLastEntry()"
      v-on:keydown.left="focusLastEntry()"
    >
      <EntryComponent
        v-for="entry in entries"
        :key="entry.hash"
        v-bind:filtered="!entry.pinned && !isMatchedEntry(entry)"
        v-bind:notSearched="!isSearchedEntry(entry)"
        v-bind:entry="entry"
        v-bind:tabindex="getTabindex(entry)"
        v-bind:selected="selectedHashes.has(entry.hash)"
        v-on:toggle-select="toggleSelect(entry.hash)"
      />
      <div class="no-entry" v-if="entries.length === 0 && initComplete">
        <IconKey />
        <p>
          {{ i18n.no_entires }}
          <a href="#" v-on:click="openLink('https://otp.ee/quickstart')">{{
            i18n.learn_more
          }}</a>
        </p>
      </div>
    </div>
    <!-- Batch action bar -->
    <div class="batch-bar" v-if="style.isSelecting">
      <div class="batch-select-all" v-on:click="toggleSelectAll()">
        <div v-bind:class="{ 'checkbox-inner': true, checked: isAllSelected }">
          <IconCheck v-if="isAllSelected" />
        </div>
        <span>{{
          isAllSelected
            ? i18n.deselect_all || "Deselect all"
            : i18n.select_all || "Select all"
        }}</span>
      </div>
      <button
        class="batch-delete-btn"
        v-bind:disabled="selectedHashes.size === 0"
        v-on:click="batchDelete()"
      >
        {{ (i18n.delete || "Delete") + " (" + selectedHashes.size + ")" }}
      </button>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState, mapGetters } from "vuex";
import { OTPEntry } from "../../models/otp";
import { EntryStorage } from "../../models/storage";

import EntryComponent from "./EntryComponent.vue";

// import IconPlus from "../../../svg/plus.svg";
import IconKey from "../../../svg/key-solid.svg";
import IconCheck from "../../../svg/check.svg";

const computed: {
  filter: () => boolean;
  showSearch: () => boolean;
  shouldFilter: () => boolean;
  entries: () => OTPEntry[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style: () => any;
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
    };
  },
  computed: {
    ...computed,
    visibleEntriesCount(): number {
      return this.entries.filter((entry) => this.isEntryVisible(entry)).length;
    },
    totalEntriesCount(): number {
      return this.entries.length;
    },
    isAllSelected(): boolean {
      return (
        this.entries.length > 0 &&
        this.entries.every((entry) =>
          (this.selectedHashes as Set<string>).has(entry.hash)
        )
      );
    },
  },
  methods: {
    openLink(url: string) {
      window.open(url, "_blank");
      return;
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
      if (
        entry.issuer.toLowerCase().includes(this.searchText.toLowerCase()) ||
        entry.account.toLowerCase().includes(this.searchText.toLowerCase())
      ) {
        return true;
      } else {
        return false;
      }
    },
    clearFilter() {
      this.$store.dispatch("accounts/clearFilter");
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
        this.selectedHashes = new Set(this.entries.map((entry) => entry.hash));
      }
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
      const firstEntry = this.entries.find((entry) =>
        this.isEntryVisible(entry)
      );

      return entry === firstEntry ? 0 : -1;
    },
    findNextEntryIndex(reverse: boolean) {
      if (document.activeElement?.getAttribute("data-x-role") !== "entry") {
        return -1;
      }

      const activeIndex = Array.prototype.indexOf.call(
        document.querySelectorAll(".entry"),
        document.activeElement
      );
      if (activeIndex === -1) {
        return -1;
      }

      // reverse modify origin array, and use slice() to make a clone first
      const _entries = reverse ? this.entries.slice().reverse() : this.entries;

      let nextIndex = _entries.findIndex(
        (entry, index) =>
          index >
            (reverse ? this.entries.length - 1 - activeIndex : activeIndex) &&
          this.isEntryVisible(entry)
      );

      if (nextIndex === -1) {
        nextIndex = _entries.findIndex((entry) => this.isEntryVisible(entry));
      }

      return nextIndex;
    },
    focusNextEntry() {
      const nextIndex = this.findNextEntryIndex(false);
      document
        .querySelector<HTMLLinkElement>(`.entry:nth-child(${nextIndex + 1})`)
        ?.focus();
    },
    focusLastEntry() {
      const lastIndex = this.entries.length - 1 - this.findNextEntryIndex(true);
      document
        .querySelector<HTMLLinkElement>(`.entry:nth-child(${lastIndex + 1})`)
        ?.focus();
    },
  },
  created() {
    // Don't drag if !isEditing
    this.$dragula.$service.options("entryDrake", {
      invalid: () => {
        if (!this.$store.state.style.style.isEditing) {
          return true;
        } else {
          return false;
        }
      },
    });

    // Update entry index if dragged
    this.$dragula.$service.eventBus.$on(
      "dropModel",
      async ({
        dragIndex,
        dropIndex,
      }: {
        dragIndex: number;
        dropIndex: number;
      }) => {
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
    // IconPlus,
    IconKey,
    IconCheck,
  },
});
</script>
