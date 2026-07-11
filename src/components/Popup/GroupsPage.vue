<template>
  <div class="subpage group-page">
    <div class="subpage-head">
      <div class="subpage-title">{{ i18n.ui_group_title }}</div>
      <div class="subpage-subtitle">
        {{ i18n.ui_group_subtitle }}
      </div>
    </div>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_add_group_section }}</div>
      </div>
      <div class="subpage-card group-create-card">
        <div class="group-create-row">
          <input
            id="newGroupInput"
            class="subpage-text-input group-create-input"
            type="text"
            v-model="newGroupName"
            :placeholder="i18n.ui_new_group_placeholder"
            maxlength="40"
            @keydown.enter.prevent="createGroup"
          />
          <button
            class="group-create-button"
            type="button"
            :title="i18n.ui_add_group"
            :aria-label="i18n.ui_add_group"
            :disabled="!newGroupName.trim()"
            @click="createGroup"
          >
            <IconPlus />
          </button>
        </div>
      </div>
    </section>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_existing_groups }}</div>
        <span class="subpage-section-meta">
          {{ groups.length }} {{ i18n.ui_items }}
        </span>
      </div>

      <div class="subpage-list-card group-admin-list" v-if="groups.length">
        <div
          v-for="(group, index) in groups"
          :key="group.id"
          class="group-admin-item"
        >
          <template v-if="editingGroupId === group.id">
            <input
              ref="groupEditInput"
              class="subpage-text-input group-edit-input"
              type="text"
              v-model="editingName"
              maxlength="40"
              :aria-label="i18n.ui_edit_group_name"
              @blur="commitRename(group.id)"
              @keydown.enter.prevent="commitRename(group.id)"
              @keydown.esc.prevent="cancelRename"
            />
          </template>
          <div v-else class="group-name-display" :title="group.name">
            {{ group.name }}
          </div>

          <div class="group-row-actions">
            <button
              class="group-icon-btn edit"
              type="button"
              :title="i18n.ui_edit_group"
              :aria-label="i18n.ui_edit_group"
              @click="startEdit(group)"
            >
              <IconPencil />
            </button>
            <button
              class="group-icon-btn"
              type="button"
              :title="i18n.ui_move_up"
              :aria-label="i18n.ui_move_up"
              :disabled="index === 0"
              @click="moveGroup(index, index - 1)"
            >
              <IconArrowLeft class="icon-rotate-up" />
            </button>
            <button
              class="group-icon-btn"
              type="button"
              :title="i18n.ui_move_down"
              :aria-label="i18n.ui_move_down"
              :disabled="index === groups.length - 1"
              @click="moveGroup(index, index + 1)"
            >
              <IconArrowLeft class="icon-rotate-down" />
            </button>
            <button
              class="group-icon-btn danger"
              type="button"
              :title="i18n.delete"
              :aria-label="i18n.delete"
              @click="deleteGroup(group.id)"
            >
              <IconXCircle />
            </button>
          </div>
        </div>
      </div>

      <div class="subpage-empty" v-else>
        <span class="subpage-row-icon neutral"><IconPlus /></span>
        <div class="subpage-empty-title">{{ i18n.ui_no_groups }}</div>
        <div class="subpage-empty-desc">
          {{ i18n.ui_no_groups_desc }}
        </div>
      </div>
    </section>
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
      const createdGroup = await this.$store.dispatch(
        "groups/createGroup",
        name
      );
      if (!createdGroup) {
        this.$store.commit("notification/alert", this.i18n.ui_group_duplicate);
        return;
      }
      this.newGroupName = "";
    },
    startEdit(group: OTPGroupInterface) {
      this.editingGroupId = group.id;
      this.editingName = group.name;
      this.$nextTick(() => {
        const inputRef = this.$refs.groupEditInput as
          | HTMLInputElement
          | HTMLInputElement[]
          | undefined;
        const target = Array.isArray(inputRef) ? inputRef[0] : inputRef;
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

      const renamed = await this.$store.dispatch("groups/renameGroup", {
        id: groupId,
        name: nextName,
      });
      if (!renamed) {
        this.$store.commit("notification/alert", this.i18n.ui_group_duplicate);
        return;
      }
      this.editingGroupId = "";
      this.editingName = "";
    },
    cancelRename() {
      this.editingGroupId = "";
      this.editingName = "";
    },
    async deleteGroup(groupId: string) {
      if (this.$store.getters["accounts/currentlyEncrypted"]) {
        this.$store.commit(
          "notification/alert",
          this.i18n.ui_unlock_before_group_delete
        );
        this.$store.commit("style/showInfo", true);
        this.$store.commit("currentView/changeView", "EnterPasswordPage");
        return;
      }
      if (
        !(await this.$store.dispatch(
          "notification/confirm",
          this.i18n.ui_group_delete_confirm
        ))
      ) {
        return;
      }
      const deleted = await this.$store.dispatch("groups/deleteGroup", groupId);
      if (!deleted) {
        this.$store.commit(
          "notification/alert",
          this.i18n.ui_unlock_before_group_delete
        );
      }
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
