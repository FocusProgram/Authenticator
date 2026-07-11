import "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import AddAccountPage from "../../../components/Popup/AddAccountPage.vue";
import { Encryption } from "../../../models/encryption";
import { OTPAlgorithm, OTPEntry, OTPType } from "../../../models/otp";

mocha.setup("bdd");

describe("AddAccountPage", () => {
  it("uses the active encryption stored in the accounts Map", async () => {
    const activeEncryption = new Encryption("active-key", "active-id");
    const staleEncryption = new Encryption("stale-key", "stale-id");
    let createdEntry: OTPEntry | undefined;
    sinon
      .stub(OTPEntry.prototype, "create")
      .callsFake(async function (this: OTPEntry) {
        createdEntry = this;
      });

    const dispatch = sinon.stub().resolves();
    const commit = sinon.stub();
    const context = {
      newAccount: {
        issuer: " GitHub ",
        account: " user@example.com ",
        note: " primary ",
        groupId: "",
        secret: "JBSW Y3DP EHPK 3PXP",
        type: OTPType.totp,
        period: 30,
        digits: 6,
        algorithm: OTPAlgorithm.SHA1,
      },
      i18n: { errorsecret: "invalid secret" },
      resolveGroupId: sinon.stub().resolves("group-1"),
      $store: {
        state: {
          accounts: {
            defaultEncryption: "active-id",
            encryption: new Map([
              ["stale-id", staleEncryption],
              ["active-id", activeEncryption],
            ]),
          },
        },
        dispatch,
        commit,
      },
    };
    const addNewAccount = (AddAccountPage as any).options.methods.addNewAccount;

    await addNewAccount.call(context);

    expect(createdEntry?.encryption).to.equal(activeEncryption);
    expect(createdEntry?.issuer).to.equal("GitHub");
    expect(createdEntry?.account).to.equal("user@example.com");
    expect(createdEntry?.note).to.equal("primary");
    expect(createdEntry?.groupId).to.equal("group-1");
    expect(dispatch.calledWith("accounts/addCode", createdEntry)).to.equal(
      true
    );
  });
});
