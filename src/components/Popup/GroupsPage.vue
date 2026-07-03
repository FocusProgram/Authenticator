<template>
  <div class="group-page">
    <div class="group-page-head">
      <div class="group-page-title">分组管理</div>
      <div class="group-page-subtitle">新增、编辑、排序、删除分组</div>
    </div>

    <div class="group-inline-row group-create-row">
      <input
        id="newGroupInput"
        class="input group-inline-input"
        type="text"
        v-model="newGroupName"
        placeholder="新增分组"
        @keydown.enter.prevent="createGroup"
      />
      <button
        class="group-icon-btn primary"
        type="button"
        title="新增分组"
        @click="createGroup"
      >
        <IconPlus />
      </button>
    </div>

    <div class="group-admin-list" v-if="groups.length > 0">
      <div
        v-for="(group, index) in groups"
        :key="group.id"
        class="group-admin-item"
      >
        <template v-if="editingGroupId === group.id">
          <input
            :data-group-input="group.id"
            class="input group-inline-input"
            type="text"
            v-model="editingName"
            @blur="commitRename(group.id)"
            @keydown.enter.prevent="commitRename(group.id)"
          />
        </template>
        <div v-else class="group-name-display">
          {{ group.name }}
        </div>

        <div class="group-row-actions">
          <button
            class="group-icon-btn"
            type="button"
            title="编辑分组"
            @click="startEdit(group)"
          >
            <IconPencil />
          </button>
          <button
            class="group-icon-btn"
            type="button"
            title="上移"
            :disabled="index === 0"
            @click="moveGroup(index, index - 1)"
          >
            <IconArrowLeft class="icon-rotate-up" />
          </button>
          <button
            class="group-icon-btn"
            type="button"
            title="下移"
            :disabled="index === groups.length - 1"
            @click="moveGroup(index, index + 1)"
          >
            <IconArrowLeft class="icon-rotate-down" />
          </button>
          <button
            class="group-icon-btn danger"
            type="button"
            title="删除"
            @click="deleteGroup(group.id)"
          >
            <IconXCircle />
          </button>
        </div>
      </div>
    </div>

    <div class="group-empty" v-else>还没有分组，先新增一个分组吧。</div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import IconPlus from "../../../svg/plus.svg";
import IconPencil from "../../../svg/pencil.svg";
import IconArrowLeft from "../../../svg/arrow-left.svg";
import IconXCircle from "../../../svg/x-circle.svg";

export default Vue.extend({
  data() {
    return {
      newGroupName: "",
      editingGroupId: "",
      editingName: "",
    };
  },
  computed: {
    groups(): OTPGroupInterface[] {
      return this.$store.state.groups.groups;
    },
  },
  methods: {
    async createGroup() {
      const name = this.newGroupName.trim();
      if (!name) {
        return;
      }
      await this.$store.dispatch("groups/createGroup", name);
      this.newGroupName = "";
    },
    startEdit(group: OTPGroupInterface) {
      this.editingGroupId = group.id;
      this.editingName = group.name;
      this.$nextTick(() => {
        const target = document.querySelector<HTMLInputElement>(
          `[data-group-input="${group.id}"]`
        );
        if (!target) {
          return;
        }
        target.focus();
        target.select();
      });
    },
    async commitRename(groupId: string) {
      const currentGroup = this.groups.find((group) => group.id === groupId);
      if (!currentGroup) {
        return;
      }

      const nextName = this.editingName.trim();

      if (!nextName) {
        this.editingGroupId = "";
        this.editingName = "";
        return;
      }

      if (nextName === currentGroup.name) {
        this.editingGroupId = "";
        this.editingName = "";
        return;
      }

      await this.$store.dispatch("groups/renameGroup", {
        id: groupId,
        name: nextName,
      });
      this.editingGroupId = "";
      this.editingName = "";
    },
    async deleteGroup(groupId: string) {
      if (
        !(await this.$store.dispatch(
          "notification/confirm",
          this.i18n.group_delete_confirm || "Delete this group?"
        ))
      ) {
        return;
      }
      await this.$store.dispatch("groups/deleteGroup", groupId);
    },
    async moveGroup(from: number, to: number) {
      await this.$store.dispatch("groups/moveGroup", { from, to });
    },
  },
  components: {
    IconPlus,
    IconPencil,
    IconArrowLeft,
    IconXCircle,
  },
});
</script>
