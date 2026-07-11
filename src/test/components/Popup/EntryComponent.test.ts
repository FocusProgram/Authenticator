import "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import { createLocalVue, shallowMount } from "@vue/test-utils";
import Vuex from "vuex";
import EntryComponent from "../../../components/Popup/EntryComponent.vue";
import { OTPAlgorithm, OTPType } from "../../../models/otp";

mocha.setup("bdd");

describe("EntryComponent", () => {
  it("prevents duplicate HOTP increments while an update is pending", async () => {
    const clock = sinon.useFakeTimers();
    const next = sinon.stub().resolves();
    const context = {
      style: { hotpDisabled: false },
      $store: {
        commit: (_mutation: string, disabled: boolean) => {
          context.style.hotpDisabled = disabled;
        },
      },
    };
    const nextCode = (EntryComponent as any).options.methods.nextCode;

    const firstUpdate = nextCode.call(context, { next });
    const duplicateUpdate = nextCode.call(context, { next });
    await Promise.all([firstUpdate, duplicateUpdate]);

    expect(next.calledOnce).to.equal(true);
    expect(context.style.hotpDisabled).to.equal(true);

    await clock.tickAsync(3000);
    expect(context.style.hotpDisabled).to.equal(false);
  });

  it("does not intercept editing keystrokes with entry shortcuts", async () => {
    const localVue = createLocalVue();
    localVue.use(Vuex);
    localVue.prototype.i18n = {
      accountName: "Account",
      cancel: "Cancel",
      group_ungrouped: "Ungrouped",
      issuer: "Issuer",
      note: "Notes",
      save: "Save",
      secret: "Secret",
      ui_group_section: "Group",
    };

    const store = new Vuex.Store({
      modules: {
        accounts: {
          namespaced: true,
          state: {
            OTPType,
            sectorStart: true,
            sectorOffset: 0,
            second: 0,
          },
        },
        groups: {
          namespaced: true,
          state: { groups: [] },
        },
        menu: {
          namespaced: true,
          state: { exportDisabled: false, useAutofill: false },
        },
        style: {
          namespaced: true,
          state: {
            style: { hotpDisabled: false, isSelecting: false },
          },
        },
      },
    });
    const entry = {
      account: "user@example.com",
      algorithm: OTPAlgorithm.SHA1,
      code: "123456",
      counter: 0,
      digits: 6,
      groupId: undefined,
      hash: "entry-1",
      issuer: "Example",
      note: "editable note",
      period: 30,
      pinned: false,
      secret: "JBSWY3DPEHPK3PXP",
      type: OTPType.totp,
    };
    const wrapper = shallowMount(EntryComponent, {
      localVue,
      store,
      propsData: {
        entry,
        selected: false,
        swipeOpen: false,
        tabindex: 0,
      },
    });

    await wrapper.setData({ detailsOpen: true, detailsMode: "edit" });
    const textarea = wrapper.find("textarea").element;

    for (const key of ["e", " ", "Delete"]) {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
      });
      textarea.dispatchEvent(event);
      expect(event.defaultPrevented, `${key} should remain editable`).to.equal(
        false
      );
    }

    wrapper.destroy();
  });
});
