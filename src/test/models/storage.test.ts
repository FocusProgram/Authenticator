import "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import { Encryption } from "../../models/encryption";
import { OTPEntry, OTPType } from "../../models/otp";
import {
  BrowserStorage,
  EntryStorage,
  GroupStorage,
} from "../../models/storage";

mocha.setup("bdd");

describe("Browser storage replacement", () => {
  it("rolls back ordinary OTP changes when a storage write fails", async () => {
    const entryId = "00000000-0000-4000-8000-000000000001";
    const previousEntry = createRawEntry(entryId, 0);
    const nextEntry = { ...previousEntry, issuer: "Changed" };
    const removeStub = sinon.stub(BrowserStorage, "remove").resolves();
    const setStub = sinon.stub(BrowserStorage, "set");
    setStub.onFirstCall().rejects(new Error("write failed"));
    setStub.onSecondCall().resolves();

    let error: Error | null = null;
    try {
      await BrowserStorage.commitOtpAndGroupChanges(
        { [entryId]: nextEntry },
        [],
        { [entryId]: previousEntry }
      );
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).to.equal("write failed");
    expect(removeStub.calledWith([entryId])).to.equal(true);
    expect(setStub.secondCall.args[0]).to.deep.equal({
      [entryId]: previousEntry,
    });
  });

  it("replaces only OTP and group records while preserving settings", async () => {
    const oldEntry: RawOTPStorage = {
      encrypted: false,
      hash: "11111111-1111-4111-8111-111111111111",
      index: 0,
      secret: "JBSWY3DPEHPK3PXP",
      type: "totp",
    };
    const newEntry: RawOTPStorage = {
      encrypted: false,
      hash: "22222222-2222-4222-8222-222222222222",
      index: 0,
      secret: "JBSWY3DPEHPK3PXQ",
      type: "totp",
    };
    const getStub = sinon.stub(BrowserStorage, "get");
    getStub.onFirstCall().resolves(({
      UserSettings: { theme: "flat" },
      [oldEntry.hash]: oldEntry,
    } as unknown) as { [key: string]: OTPStorage });
    getStub.onSecondCall().resolves(({
      UserSettings: { theme: "flat" },
      [oldEntry.hash]: oldEntry,
    } as unknown) as { [key: string]: OTPStorage });
    getStub.onThirdCall().resolves(({
      UserSettings: { theme: "flat" },
      [newEntry.hash]: newEntry,
    } as unknown) as { [key: string]: OTPStorage });
    sinon.stub(BrowserStorage, "getKeys").resolves([]);
    const removeStub = sinon.stub(BrowserStorage, "remove").resolves();
    const setStub = sinon.stub(BrowserStorage, "set").resolves();

    await BrowserStorage.replaceOtpAndGroupData({
      [newEntry.hash]: newEntry,
    });

    expect(removeStub.firstCall.args[0]).to.deep.equal([oldEntry.hash]);
    expect(setStub.firstCall.args[0]).to.deep.equal({
      [newEntry.hash]: newEntry,
    });
  });

  it("clears OTP and group records without removing settings or encryption keys", async () => {
    const entry = createRawEntry("10101010-1010-4010-8010-101010101010", 0);
    const group: GroupStorageRecord = {
      dataType: "Group",
      id: "group-1",
      name: "工作",
      index: 0,
    };
    const currentData = ({
      UserSettings: { theme: "flat" },
      "key-1": {
        dataType: "Key",
        id: "key-1",
        salt: "salt",
        hash: "hash",
        version: 3,
      },
      [entry.hash]: entry,
      [group.id]: group,
    } as unknown) as Record<string, OTPStorage>;
    sinon.stub(BrowserStorage, "get").resolves(currentData);
    const commitStub = sinon
      .stub(BrowserStorage, "commitOtpAndGroupChanges")
      .resolves();

    const result = await BrowserStorage.clearOtpAndGroupData();

    expect(result).to.deep.equal({
      clearedEntryCount: 1,
      clearedGroupCount: 1,
    });
    expect(commitStub.firstCall.args[0]).to.deep.equal({});
    expect(commitStub.firstCall.args[1]).to.deep.equal([entry.hash, group.id]);
  });

  it("rejects imports that would overwrite extension settings", async () => {
    sinon.stub(BrowserStorage, "get").resolves(
      {} as {
        [key: string]: OTPStorage;
      }
    );
    sinon.stub(BrowserStorage, "getKeys").resolves([]);
    const removeStub = sinon.stub(BrowserStorage, "remove").resolves();
    const setStub = sinon.stub(BrowserStorage, "set").resolves();

    let error: Error | null = null;
    try {
      await BrowserStorage.replaceOtpAndGroupData({
        UserSettings: {
          dataType: "Group",
          id: "UserSettings",
          name: "冲突分组",
          index: 0,
        },
      });
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).to.equal("importSystemKeyConflict");
    expect(removeStub.called).to.equal(false);
    expect(setStub.called).to.equal(false);
  });

  it("encrypts group names in provider backups", async () => {
    const group: GroupStorageRecord = {
      dataType: "Group",
      id: "33333333-3333-4333-8333-333333333333",
      name: "私密分组",
      index: 0,
    };
    sinon.stub(BrowserStorage, "get").resolves({
      [group.id]: group,
    });
    sinon.stub(BrowserStorage, "getKeys").resolves([
      {
        dataType: "Key",
        id: "key-1",
        salt: "salt",
        hash: "hash",
        version: 3,
      },
    ]);

    const result = await EntryStorage.backupGetExport(
      new Encryption("test-encryption-key", "key-1"),
      true
    );
    const serialized = JSON.stringify(result);
    const groupRecord = result[group.id] as EncGroupStorageRecord;

    expect(groupRecord.dataType).to.equal("EncGroup");
    expect(serialized).to.not.contain(group.name);
  });

  it("rejects an imported group id that collides with an existing OTP", async () => {
    const collidingId = "11111111-1111-4111-8111-111111111111";
    const existingEntry: RawOTPStorage = {
      encrypted: false,
      hash: collidingId,
      index: 0,
      secret: "JBSWY3DPEHPK3PXP",
      type: "totp",
    };
    sinon.stub(BrowserStorage, "getKeys").resolves([]);
    sinon.stub(BrowserStorage, "get").resolves({
      [collidingId]: existingEntry,
    });

    let error: Error | null = null;
    try {
      await GroupStorage.import({
        [collidingId]: {
          dataType: "Group",
          id: collidingId,
          name: "冲突分组",
          index: 0,
        },
      });
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).to.equal("importTypeConflict");
  });

  it("rejects group ids that can mutate object prototypes", () => {
    const groups = Object.create(null) as Record<string, GroupStorageRecord>;
    groups.__proto__ = {
      dataType: "Group",
      id: "__proto__",
      name: "unsafe",
      index: 0,
    };

    expect(() => GroupStorage.getImportGroups(groups)).to.throw(
      "invalidImportGroupId"
    );
  });

  it("rejects an imported OTP hash that collides with an existing group", async () => {
    const collidingId = "22222222-2222-4222-8222-222222222222";
    sinon.stub(BrowserStorage, "getKeys").resolves([]);
    sinon.stub(BrowserStorage, "get").resolves({
      [collidingId]: {
        dataType: "Group",
        id: collidingId,
        name: "已有分组",
        index: 0,
      },
    });
    sinon.stub(BrowserStorage, "set").resolves();

    let error: Error | null = null;
    try {
      await EntryStorage.import(new Encryption("", ""), {
        [collidingId]: {
          encrypted: false,
          hash: collidingId,
          index: 0,
          secret: "JBSWY3DPEHPK3PXP",
          type: "totp",
        },
      });
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).to.equal("importTypeConflict");
  });

  it("generates a new hash instead of overwriting an existing OTP", async () => {
    const existingId = "22222222-2222-4222-8222-222222222223";
    const existingEntry = createRawEntry(existingId, 0);
    sinon.stub(BrowserStorage, "getKeys").resolves([]);
    sinon.stub(BrowserStorage, "get").resolves({
      [existingId]: existingEntry,
    });
    const setStub = sinon.stub(BrowserStorage, "set").resolves();

    await EntryStorage.import(new Encryption("", ""), {
      [existingId]: {
        ...existingEntry,
        secret: "JBSWY3DPEHPK3PXQ",
      },
    });

    const payload = setStub.firstCall.args[0] as Record<string, OTPStorage>;
    const importedIds = Object.keys(payload).filter((id) => id !== existingId);
    expect(importedIds).to.have.length(1);
    expect((payload[existingId] as RawOTPStorage).secret).to.equal(
      existingEntry.secret
    );
    expect((payload[importedIds[0]] as RawOTPStorage).secret).to.equal(
      "JBSWY3DPEHPK3PXQ"
    );
  });

  it("rejects an OTP and group using the same id in one replacement", async () => {
    const collidingId = "33333333-3333-4333-8333-333333333333";
    const replaceStub = sinon
      .stub(BrowserStorage, "replaceOtpAndGroupData")
      .resolves();

    let error: Error | null = null;
    try {
      await EntryStorage.replaceImport(
        new Encryption("", ""),
        {
          [collidingId]: {
            encrypted: false,
            hash: collidingId,
            index: 0,
            secret: "JBSWY3DPEHPK3PXP",
            type: "totp",
          },
        },
        {
          [collidingId]: {
            dataType: "Group",
            id: collidingId,
            name: "冲突分组",
            index: 0,
          },
        }
      );
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).to.equal("importBatchIdConflict");
    expect(replaceStub.called).to.equal(false);
  });

  it("encrypts restored entries with the selected active encryption", async () => {
    const entryId = "44444444-4444-4444-8444-444444444444";
    const replaceStub = sinon
      .stub(BrowserStorage, "replaceOtpAndGroupData")
      .resolves();
    const encryption = new Encryption("active-encryption-key", "key-1");

    await EntryStorage.replaceImport(
      encryption,
      {
        [entryId]: {
          encrypted: false,
          hash: entryId,
          index: 0,
          secret: "JBSWY3DPEHPK3PXP",
          type: "totp",
        },
      },
      {}
    );

    const payload = replaceStub.firstCall.args[0];
    expect(payload[entryId].dataType).to.equal("EncOTPStorage");
    expect((payload[entryId] as EncOTPStorage).keyId).to.equal("key-1");
  });

  it("inserts new entries at index zero and shifts existing entries", async () => {
    const existingA = createRawEntry("55555555-5555-4555-8555-555555555555", 0);
    const existingB = createRawEntry("66666666-6666-4666-8666-666666666666", 1);
    sinon.stub(BrowserStorage, "get").resolves({
      [existingA.hash]: existingA,
      [existingB.hash]: existingB,
    });
    const commitStub = sinon
      .stub(BrowserStorage, "commitOtpAndGroupChanges")
      .resolves();
    const entry = new OTPEntry({
      encrypted: false,
      hash: "77777777-7777-4777-8777-777777777777",
      index: 9,
      secret: "JBSWY3DPEHPK3PXP",
      type: OTPType.totp,
    });

    await EntryStorage.add(entry);

    const payload = commitStub.firstCall.args[0] as Record<string, OTPStorage>;
    expect(payload[entry.hash].index).to.equal(0);
    expect(payload[existingA.hash].index).to.equal(1);
    expect(payload[existingB.hash].index).to.equal(2);
  });

  it("renumbers remaining entries after a single deletion", async () => {
    const removed = createRawEntry("88888888-8888-4888-8888-888888888888", 0);
    const remaining = createRawEntry("99999999-9999-4999-8999-999999999999", 1);
    sinon.stub(BrowserStorage, "get").resolves({
      [removed.hash]: removed,
      [remaining.hash]: remaining,
    });
    const commitStub = sinon
      .stub(BrowserStorage, "commitOtpAndGroupChanges")
      .resolves();
    const removedEntry = new OTPEntry({
      encrypted: false,
      hash: removed.hash,
      index: removed.index,
      secret: removed.secret,
      type: OTPType.totp,
    });

    await EntryStorage.delete(removedEntry);

    const payload = commitStub.firstCall.args[0] as Record<string, OTPStorage>;
    expect(payload[remaining.hash].index).to.equal(0);
    expect(payload[removed.hash]).to.equal(undefined);
    expect(commitStub.firstCall.args[1]).to.deep.equal([removed.hash]);
  });

  it("renumbers remaining entries after a batch deletion", async () => {
    const first = createRawEntry("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0);
    const second = createRawEntry("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1);
    const third = createRawEntry("cccccccc-cccc-4ccc-8ccc-cccccccccccc", 2);
    sinon.stub(BrowserStorage, "get").resolves({
      [first.hash]: first,
      [second.hash]: second,
      [third.hash]: third,
    });
    const commitStub = sinon
      .stub(BrowserStorage, "commitOtpAndGroupChanges")
      .resolves();

    await EntryStorage.removeMany([first.hash, second.hash]);

    const payload = commitStub.firstCall.args[0] as Record<string, OTPStorage>;
    expect(payload[third.hash].index).to.equal(0);
    expect(Object.keys(payload)).to.deep.equal([third.hash]);
    expect(commitStub.firstCall.args[1]).to.deep.equal([
      first.hash,
      second.hash,
    ]);
  });
});

function createRawEntry(hash: string, index: number): RawOTPStorage {
  return {
    encrypted: false,
    hash,
    index,
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
  };
}
