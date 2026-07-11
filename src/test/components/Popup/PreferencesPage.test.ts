import "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import PreferencesPage from "../../../components/Popup/PreferencesPage.vue";
import { StorageLocation, UserSettings } from "../../../models/settings";

mocha.setup("bdd");

describe("PreferencesPage", () => {
  it("restores the selected storage location when migration fails", async () => {
    const previousItems = UserSettings.items;
    UserSettings.items = { storageLocation: StorageLocation.Local };
    sinon.stub(UserSettings, "updateItems").resolves();
    const commit = sinon.spy();
    const dispatch = sinon.stub().rejects(new Error("quota exceeded"));
    const context = {
      newStorageLocation: StorageLocation.Sync,
      i18n: { updateFailure: "Update failed: " },
      $store: {
        state: { menu: { storageArea: "" } },
        commit,
        dispatch,
      },
    };
    const migrateStorage = (PreferencesPage as any).options.methods
      .migrateStorage;

    try {
      await migrateStorage.call(context);
      expect(context.newStorageLocation).to.equal(StorageLocation.Local);
      expect(
        commit.calledWith("notification/alert", "Update failed: quota exceeded")
      ).to.equal(true);
      expect(
        commit.calledWith("currentView/changeView", "PreferencesPage")
      ).to.equal(true);
    } finally {
      UserSettings.items = previousItems;
    }
  });
});
