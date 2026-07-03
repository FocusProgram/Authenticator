<template>
  <div id="import" class="theme-normal">
    <div v-if="!shouldShowPassphrase">
      <div class="import_tab">
        <input
          type="radio"
          id="import_file_radio"
          value="FileImport"
          v-model="importType"
        />
        <label for="import_file_radio">{{ i18n.import_backup_file }}</label>
        <input
          type="radio"
          id="import_qr_radio"
          value="QrImport"
          v-model="importType"
        />
        <label for="import_qr_radio">{{ i18n.import_backup_qr }}</label>
        <input
          type="radio"
          id="import_code_radio"
          value="TextImport"
          v-model="importType"
        />
        <label for="import_code_radio">{{ i18n.import_backup_code }}</label>
      </div>
      <div>
        <p id="import_info">
          {{ i18n.otp_backup_inform }}
          <a href="https://otp.ee/otpbackup" target="_blank">{{
            i18n.otp_backup_learn
          }}</a>
        </p>
        <div class="import-help-card">
          <div class="import-help-title">使用说明</div>
          <ul class="import-help-list">
            <li v-if="importType === 'FileImport'">
              支持文件格式：<strong>.json</strong>、<strong>.txt</strong>。
            </li>
            <li v-if="importType === 'FileImport'">
              其中支持 Bitwarden 导出的 <strong>JSON</strong> 备份文件。
            </li>
            <li v-if="importType === 'FileImport'">
              可选勾选“<strong>导入前清空现有数据</strong>”，先清空当前 OTP
              和分组，再导入新备份。
            </li>
            <li v-if="importType === 'QrImport'">
              支持图片格式：<strong>.png</strong>、<strong>.jpg</strong>、<strong>.jpeg</strong>、<strong>.webp</strong>、<strong
                >.gif</strong
              >
              等常见图片格式。
            </li>
            <li v-if="importType === 'TextImport'">
              可粘贴 <strong>otpauth://</strong> 文本、备份
              <strong>JSON</strong> 文本或普通
              <strong>TXT</strong> 文本内容进行导入。
            </li>
            <li
              v-if="importType === 'TextImport' || importType === 'FileImport'"
            >
              当前暂不支持 <strong>.csv</strong> 作为导入源。
            </li>
            <li>导入完成后，结果会直接显示在当前页面。</li>
          </ul>
        </div>
      </div>
      <component v-bind:is="importType" />
    </div>
    <div v-if="shouldShowPassphrase" class="error_password">
      {{ i18n.import_error_password }}
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import FileImport from "./Import/FileImport.vue";
import QrImport from "./Import/QrImport.vue";
import TextImport from "./Import/TextImport.vue";

export default Vue.extend({
  data: function () {
    const query = location.search ? location.search.substr(1) : "";
    const importType = ["FileImport", "QrImport", "TextImport"].includes(query)
      ? query
      : "FileImport";
    return {
      importType,
      shouldShowPassphrase: shouldShowPassphrase(this.$entries),
    };
  },
  components: {
    FileImport,
    QrImport,
    TextImport,
  },
  mounted() {
    chrome.runtime.onMessage.addListener((event) => {
      if (event.action === "stopImport") {
        this.shouldShowPassphrase = true;
      }

      // https://stackoverflow.com/a/56483156
      return true;
    });
  },
});

function shouldShowPassphrase(entries: OTPEntryInterface[]) {
  for (const entry of entries) {
    if (!entry.secret) {
      return true;
    }
  }
  return false;
}
</script>
