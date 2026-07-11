<template>
  <form class="subpage add-account-page" @submit.prevent="addNewAccount">
    <div class="subpage-head">
      <div class="subpage-title">{{ i18n.add_secret }}</div>
      <div class="subpage-subtitle">
        {{ i18n.ui_manual_subtitle }}
      </div>
    </div>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_basic_info }}</div>
      </div>
      <div class="subpage-card subpage-form-card">
        <label class="subpage-field">
          <span class="subpage-field-label">{{ i18n.issuer || "Name" }}</span>
          <input
            class="subpage-text-input"
            type="text"
            v-model="newAccount.issuer"
            autocomplete="off"
            :placeholder="i18n.ui_name_example"
          />
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">
            {{ i18n.accountName || "Account" }}
          </span>
          <input
            class="subpage-text-input"
            type="text"
            v-model="newAccount.account"
            autocomplete="off"
            :placeholder="i18n.ui_account_example"
          />
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">{{ i18n.secret || "Secret" }}</span>
          <input
            class="subpage-text-input add-account-secret"
            type="text"
            v-model="newAccount.secret"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            :placeholder="i18n.ui_secret_placeholder"
          />
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">{{ i18n.note || "Notes" }}</span>
          <textarea
            class="subpage-text-input add-account-note"
            v-model="newAccount.note"
            :placeholder="i18n.ui_optional"
          ></textarea>
        </label>
      </div>
    </section>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_group_section }}</div>
      </div>
      <div class="subpage-card subpage-form-card">
        <label class="subpage-field">
          <span class="subpage-field-label">{{ i18n.ui_select_group }}</span>
          <select class="subpage-select" v-model="newAccount.groupId">
            <option value="">{{ i18n.group_ungrouped || "Ungrouped" }}</option>
            <option v-for="group in groups" :key="group.id" :value="group.id">
              {{ group.name }}
            </option>
          </select>
        </label>

        <label class="subpage-field">
          <span class="subpage-field-label">{{ i18n.ui_create_group }}</span>
          <input
            class="subpage-text-input"
            type="text"
            v-model="newGroupName"
            maxlength="40"
            :placeholder="i18n.ui_create_group_placeholder"
          />
        </label>
      </div>
    </section>

    <section class="subpage-section">
      <div class="subpage-section-head">
        <div class="subpage-section-title">{{ i18n.ui_advanced_options }}</div>
      </div>
      <details class="subpage-card add-account-advanced">
        <summary>
          <span class="subpage-row-icon neutral"><IconCog /></span>
          <span class="subpage-row-copy">
            <span class="subpage-row-title">{{ i18n.ui_otp_parameters }}</span>
            <span class="subpage-row-desc">{{
              i18n.ui_otp_parameters_desc
            }}</span>
          </span>
          <IconArrowLeft class="subpage-row-arrow" />
        </summary>

        <div class="add-account-advanced-content">
          <label class="subpage-field">
            <span class="subpage-field-label">{{ i18n.type || "Type" }}</span>
            <select class="subpage-select" v-model.number="newAccount.type">
              <option :value="OTPType.totp">
                {{ i18n.based_on_time || "Time based" }}
              </option>
              <option :value="OTPType.hotp">
                {{ i18n.based_on_counter || "Counter based" }}
              </option>
              <option :value="OTPType.battle">Battle.net</option>
              <option :value="OTPType.steam">Steam</option>
            </select>
          </label>

          <label class="subpage-field">
            <span class="subpage-field-label">
              {{ i18n.period || "Period" }} ({{ i18n.ui_seconds }})
            </span>
            <input
              class="subpage-number-input add-account-number"
              type="number"
              min="1"
              v-model.number="newAccount.period"
              :disabled="newAccount.type === OTPType.hotp"
            />
          </label>

          <label class="subpage-field">
            <span class="subpage-field-label">{{
              i18n.digits || "Digits"
            }}</span>
            <select class="subpage-select" v-model.number="newAccount.digits">
              <option :value="6">6</option>
              <option :value="8">8</option>
            </select>
          </label>

          <label class="subpage-field">
            <span class="subpage-field-label">
              {{ i18n.algorithm || "Algorithm" }}
            </span>
            <select class="subpage-select" v-model="newAccount.algorithm">
              <option :value="OTPAlgorithm.SHA1">SHA-1</option>
              <option :value="OTPAlgorithm.SHA256">SHA-256</option>
              <option :value="OTPAlgorithm.SHA512">SHA-512</option>
              <option :value="OTPAlgorithm.GOST3411_2012_256">
                GOST 34.11 256
              </option>
              <option :value="OTPAlgorithm.GOST3411_2012_512">
                GOST 34.11 512
              </option>
            </select>
          </label>
        </div>
      </details>
    </section>

    <div class="subpage-actions add-account-actions">
      <button type="submit" class="subpage-button primary">
        {{ i18n.ui_add_otp }}
      </button>
    </div>
  </form>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState } from "vuex";
import IconArrowLeft from "../../../svg/arrow-left.svg";
import IconCog from "../../../svg/cog.svg";
import {
  OTPType,
  OTPEntry,
  OTPAlgorithm,
  normalizeOtpSecretForType,
} from "../../models/otp";

export default Vue.extend({
  components: {
    IconArrowLeft,
    IconCog,
  },
  data: function (): {
    newAccount: {
      issuer: string;
      account: string;
      note: string;
      groupId: string;
      secret: string;
      type: OTPType;
      period: number | undefined;
      digits: number;
      algorithm: OTPAlgorithm;
    };
    newGroupName: string;
  } {
    return {
      newAccount: {
        issuer: "",
        account: "",
        note: "",
        groupId: "",
        secret: "",
        type: OTPType.totp,
        period: undefined,
        digits: 6,
        algorithm: OTPAlgorithm.SHA1,
      },
      newGroupName: "",
    };
  },
  computed: {
    ...mapState("accounts", ["OTPType", "OTPAlgorithm"]),
    groups(): OTPGroupInterface[] {
      return this.$store.state.groups.groups;
    },
  },
  methods: {
    async resolveGroupId() {
      const newGroupName = this.newGroupName.trim();
      if (!newGroupName) {
        return this.newAccount.groupId || undefined;
      }

      const existingGroup = this.groups.find(
        (group) => group.name.toLowerCase() === newGroupName.toLowerCase()
      );
      if (existingGroup) {
        return existingGroup.id;
      }

      const createdGroup = await this.$store.dispatch(
        "groups/createGroup",
        newGroupName
      );
      return createdGroup?.id;
    },
    async addNewAccount() {
      const normalizedSecretData = normalizeOtpSecretForType(
        this.newAccount.secret,
        this.newAccount.type
      );

      if (!normalizedSecretData) {
        this.$store.commit("notification/alert", this.i18n.errorsecret);
        return;
      }

      const { secret, type } = normalizedSecretData;

      if (type === OTPType.hhex || type === OTPType.hotp) {
        this.newAccount.period = undefined;
      } else if (
        typeof this.newAccount.period !== "number" ||
        this.newAccount.period < 1
      ) {
        this.newAccount.period = undefined;
      }

      const defaultEncryptionKey = this.$store.state.accounts.defaultEncryption;
      const encryption = defaultEncryptionKey
        ? this.$store.state.accounts.encryption.get(defaultEncryptionKey)
        : undefined;
      const groupId = await this.resolveGroupId();

      const entry = new OTPEntry(
        {
          type,
          index: 0,
          issuer: this.newAccount.issuer.trim(),
          account: this.newAccount.account.trim(),
          note: this.newAccount.note.trim(),
          groupId,
          encrypted: false,
          secret,
          counter: 0,
          period: this.newAccount.period,
          digits: this.newAccount.digits,
          algorithm: this.newAccount.algorithm,
        },
        encryption
      );

      await entry.create();
      await this.$store.dispatch("accounts/addCode", entry);
      this.$store.commit("style/hideInfo");

      const codes = document.getElementById("codes");
      if (codes) {
        // wait vue apply changes to dom
        setTimeout(() => {
          codes.scrollTop = 0;
        }, 0);
      }
      return;
    },
  },
});
</script>
