import "mocha";
import { expect } from "chai";
import { createLocalVue, shallowMount } from "@vue/test-utils";
import AddMethodPage from "../../../components/Popup/AddMethodPage.vue";

mocha.setup("bdd");

describe("AddMethodPage", () => {
  it("shows a dedicated backup file import entry", () => {
    const localVue = createLocalVue();
    localVue.prototype.i18n = {
      add_qr: "Scan QR code",
      add_secret: "Manual entry",
      import_backup_file: "Import backup file",
      import_otp_urls: "Import OTP links",
      import_qr_images: "Import QR images",
      ui_add_method_section: "Choose a method",
      ui_add_method_subtitle: "Choose how to add OTP entries",
      ui_add_method_title: "Add OTP",
      ui_import_backup_file_desc: "Restore from JSON or TXT",
      ui_import_links_desc: "Import links",
      ui_import_qr_desc: "Import QR images",
      ui_manual_entry_desc: "Enter a secret",
      ui_scan_page_desc: "Scan this page",
    };
    const wrapper = shallowMount(AddMethodPage, { localVue });
    const importLink = wrapper.find('[data-test="import-backup-file"]');

    expect(wrapper.findAll(".add-method-row")).to.have.length(5);
    expect(importLink.attributes("href")).to.equal("import.html?FileImport");
    expect(importLink.attributes("target")).to.equal("_blank");

    wrapper.destroy();
  });
});
