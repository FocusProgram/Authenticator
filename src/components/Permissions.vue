<template>
  <div id="permissions" class="theme-normal">
    <main class="subpage permissions-page">
      <div class="subpage-head">
        <div class="subpage-title">{{ i18n.ui_permissions_title }}</div>
        <div class="subpage-subtitle">
          {{ i18n.ui_permissions_subtitle }}
        </div>
      </div>

      <section class="subpage-section">
        <div class="subpage-section-head">
          <div class="subpage-section-title">{{ i18n.ui_display_scope }}</div>
        </div>
        <div class="subpage-list-card">
          <label class="subpage-row permission-filter-row">
            <span class="subpage-row-icon"><IconClipboardCheck /></span>
            <span class="subpage-row-copy">
              <span class="subpage-row-title">
                {{ i18n.permission_show_required_permissions }}
              </span>
              <span class="subpage-row-desc">
                {{ i18n.ui_show_required_desc }}
              </span>
            </span>
            <span class="subpage-switch">
              <input
                id="showRequiredPermission"
                type="checkbox"
                v-model="showAllPermissions"
              />
              <span class="subpage-switch-track"></span>
            </span>
          </label>
        </div>
      </section>

      <section class="subpage-section">
        <div class="subpage-section-head">
          <div class="subpage-section-title">
            {{ i18n.ui_authorized_permissions }}
          </div>
          <span class="subpage-section-meta">
            {{ permissions.length }} {{ i18n.ui_items }}
          </span>
        </div>

        <div
          class="subpage-list-card permission-list"
          v-if="permissions.length"
        >
          <article
            class="permission-row"
            v-for="permission in permissions"
            :key="permission.id"
          >
            <span
              :class="[
                'subpage-row-icon',
                permission.revocable ? '' : 'neutral',
              ]"
            >
              <IconClipboardCheck v-if="permission.revocable" />
              <IconLock v-else />
            </span>
            <div class="subpage-row-copy">
              <div class="permission-title-line">
                <span class="subpage-row-title">
                  {{ permissionName(permission.id) }}
                </span>
                <span
                  :class="[
                    'permission-status',
                    permission.revocable ? 'optional' : 'required',
                  ]"
                >
                  {{
                    permission.revocable
                      ? i18n.ui_optional_permission
                      : i18n.ui_required_permission
                  }}
                </span>
              </div>
              <div class="subpage-row-desc">{{ permission.description }}</div>
              <div
                class="permission-required-note"
                v-if="!permission.revocable"
              >
                {{
                  i18n.permission_required ||
                  "This required permission cannot be revoked."
                }}
              </div>
            </div>
            <button
              class="subpage-button danger permission-revoke-button"
              type="button"
              v-if="permission.revocable"
              @click="revoke(permission.id)"
            >
              {{ i18n.permission_revoke || "Revoke" }}
            </button>
          </article>
        </div>

        <div class="subpage-empty" v-else>
          <span class="subpage-row-icon success"><IconClipboardCheck /></span>
          <div class="subpage-empty-title">{{ i18n.ui_no_permissions }}</div>
          <div class="subpage-empty-desc">
            {{ i18n.ui_no_permissions_desc }}
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { Permission } from "../models/permission";
import IconClipboardCheck from "../../svg/clipboard-check.svg";
import IconLock from "../../svg/lock.svg";

export default Vue.extend({
  components: {
    IconClipboardCheck,
    IconLock,
  },
  computed: {
    permissions: function () {
      return this.$store.state.permissions.permissions.filter(
        (permission: Permission) => {
          return this.showAllPermissions || permission.revocable;
        }
      );
    },
  },
  data: function () {
    return {
      showAllPermissions: false,
    };
  },
  methods: {
    permissionName(permissionId: string): string {
      const names: Record<string, string> = {
        activeTab: this.i18n.ui_permission_name_active_tab,
        storage: this.i18n.ui_permission_name_storage,
        identity: this.i18n.ui_permission_name_identity,
        alarms: this.i18n.ui_permission_name_alarms,
        scripting: this.i18n.ui_permission_name_scripting,
        clipboardWrite: this.i18n.ui_permission_name_clipboard,
        contextMenus: this.i18n.ui_permission_name_context_menu,
        "https://www.google.com/*": this.i18n.ui_permission_name_clock,
        "https://*.dropboxapi.com/*": this.i18n.ui_permission_name_dropbox,
        "https://www.googleapis.com/*": this.i18n.ui_permission_name_drive,
        "https://accounts.google.com/*": this.i18n
          .ui_permission_name_drive_login,
        "https://graph.microsoft.com/*": this.i18n.ui_permission_name_onedrive,
        "https://login.microsoftonline.com/*": this.i18n
          .ui_permission_name_onedrive_login,
      };
      return names[permissionId] || this.i18n.ui_permission_name_other;
    },
    revoke(permissionId: string) {
      this.$store.commit("permissions/revokePermission", permissionId);
    },
  },
});
</script>
