<template>
  <div class="group-toolbar">
    <label class="group-filter-label" for="groupFilterSelect">
      {{ i18n.ui_group_section }}
    </label>
    <select
      id="groupFilterSelect"
      class="group-filter-select"
      :value="activeGroupId"
      @change="onChange"
    >
      <option value="__all__">{{ i18n.group_all }} ({{ totalCount }})</option>
      <option
        v-if="ungroupedCount > 0 || activeGroupId === '__ungrouped__'"
        value="__ungrouped__"
      >
        {{ i18n.group_ungrouped }} ({{ ungroupedCount }})
      </option>
      <option v-for="group in groups" :key="group.id" :value="group.id">
        {{ group.name }} ({{ groupCounts[group.id] || 0 }})
      </option>
    </select>
    <button
      type="button"
      class="group-manage-btn"
      :title="i18n.ui_edit_group"
      :aria-label="i18n.ui_edit_group"
      @click="$emit('manage')"
    >
      <IconBars />
    </button>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import IconBars from "../../../svg/bars.svg";

export default Vue.extend({
  props: {
    groups: {
      type: Array as () => OTPGroupInterface[],
      required: true,
    },
    activeGroupId: {
      type: String,
      required: true,
    },
    totalCount: {
      type: Number,
      required: true,
    },
    ungroupedCount: {
      type: Number,
      required: true,
    },
    groupCounts: {
      type: Object as () => Record<string, number>,
      required: true,
    },
  },
  methods: {
    onChange(event: Event) {
      const target = event.target as HTMLSelectElement | null;
      if (target) {
        this.$emit("change", target.value);
      }
    },
  },
  components: {
    IconBars,
  },
});
</script>
