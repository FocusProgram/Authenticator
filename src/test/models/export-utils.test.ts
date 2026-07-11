import "mocha";
import { expect } from "chai";
import { Encryption } from "../../models/encryption";
import {
  buildCsvBackup,
  buildOtpAuthText,
  getEncryptedGroupExportData,
} from "../../models/export-utils";

mocha.setup("bdd");

describe("Backup export utilities", () => {
  const entry: RawOTPStorage = {
    encrypted: false,
    hash: "11111111-1111-4111-8111-111111111111",
    index: 0,
    issuer: "Example",
    account: "user@example.com",
    note: "primary account",
    groupId: "group-1",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
  };

  it("builds otpauth text without mutating source entries", () => {
    const source = { [entry.hash]: { ...entry } };
    const snapshot = JSON.parse(JSON.stringify(source));

    const result = buildOtpAuthText(source);

    expect(result).to.contain(
      "otpauth://totp/Example:user%40example.com?secret=JBSWY3DPEHPK3PXP"
    );
    expect(source).to.deep.equal(snapshot);
  });

  it("includes group and note fields in CSV output", () => {
    const result = buildCsvBackup({ [entry.hash]: entry }, [
      { id: "group-1", name: "工作", index: 0 },
    ]);

    expect(result).to.contain("工作");
    expect(result).to.contain("primary account");
  });

  it("protects CSV cells from spreadsheet formula injection", () => {
    const result = buildCsvBackup(
      {
        [entry.hash]: {
          ...entry,
          issuer: "=SUM(A1:A2)",
          account: "@dangerous",
          note: "\tcommand",
        },
      },
      [{ id: "group-1", name: "+unsafe-group", index: 0 }]
    );

    expect(result).to.contain("'=SUM(A1:A2)");
    expect(result).to.contain("'@dangerous");
    expect(result).to.contain("'+unsafe-group");
    expect(result).to.contain("'\tcommand");
  });

  it("does not URI-decode display values while exporting CSV", () => {
    const result = buildCsvBackup(
      {
        [entry.hash]: {
          ...entry,
          issuer: "Acme%20Corp",
        },
      },
      []
    );

    expect(result).to.contain("Acme%20Corp");
  });

  it("encrypts group names in encrypted backup records", () => {
    const records = getEncryptedGroupExportData(
      [{ id: "group-1", name: "私密分组", index: 0 }],
      new Encryption("test-encryption-key", "key-1")
    );
    const serialized = JSON.stringify(records);

    expect(records["group-1"].dataType).to.equal("EncGroup");
    expect(records["group-1"].keyId).to.equal("key-1");
    expect(serialized).to.not.contain("私密分组");
  });
});
