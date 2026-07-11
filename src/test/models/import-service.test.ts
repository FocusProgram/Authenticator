import "mocha";
import { expect } from "chai";
import * as CryptoJS from "crypto-js";
import {
  assertBackupContentSize,
  decryptParsedBackup,
  parseBackupContent,
} from "../../models/import-service";
import {
  BACKUP_PARSE_WORKER_THRESHOLD_BYTES,
  shouldParseBackupInWorker,
} from "../../models/import-worker-client";
import { normalizeImportedEntryGroupIds } from "../../models/import-utils";

mocha.setup("bdd");

describe("Backup import service", () => {
  it("uses the background parser for large backup text", () => {
    expect(
      shouldParseBackupInWorker("x".repeat(BACKUP_PARSE_WORKER_THRESHOLD_BYTES))
    ).to.equal(true);
    expect(shouldParseBackupInWorker("small backup")).to.equal(false);
  });

  it("rejects backup content larger than the configured limit", () => {
    expect(() => assertBackupContentSize("1234", 3)).to.throw(
      "backupContentTooLarge"
    );
    expect(() => assertBackupContentSize("1234", 4)).not.to.throw();
  });

  it("maps Bitwarden folders to imported OTP groups", async () => {
    const folderId = "group-1";
    const parsed = await parseBackupContent(
      JSON.stringify({
        encrypted: false,
        folders: [{ id: folderId, name: "开发" }],
        items: [
          {
            type: 1,
            name: "GitHub",
            folderId,
            login: {
              username: "developer@example.com",
              totp: "JBSWY3DPEHPK3PXP",
            },
          },
        ],
      })
    );
    const decrypted = await decryptParsedBackup(parsed, null);
    const entry = Object.values(decrypted.entries)[0];

    expect(parsed.source).to.equal("bitwarden");
    expect(decrypted.groups[folderId].name).to.equal("开发");
    expect(entry.groupId).to.equal(folderId);
  });

  it("removes group references that do not exist after import", () => {
    const entries: { [hash: string]: RawOTPStorage } = {
      entry: {
        encrypted: false,
        hash: "entry",
        index: 0,
        secret: "JBSWY3DPEHPK3PXP",
        type: "totp",
        groupId: "missing-group",
      },
    };

    const normalizedCount = normalizeImportedEntryGroupIds(entries, []);

    expect(normalizedCount).to.equal(1);
    expect(entries.entry.groupId).to.equal(undefined);
  });

  it("counts only OTP records in JSON backups", async () => {
    const parsed = await parseBackupContent(
      JSON.stringify({
        group: {
          dataType: "Group",
          id: "group",
          name: "测试",
          index: 0,
        },
        entry: {
          encrypted: false,
          hash: "entry",
          index: 0,
          secret: "JBSWY3DPEHPK3PXP",
          type: "totp",
        },
      })
    );

    expect(parsed.succeededCount).to.equal(1);
    expect(Object.keys(parsed.groups)).to.deep.equal(["group"]);
  });

  it("does not reinterpret valid but unsupported JSON as otpauth text", async () => {
    let error: Error | null = null;
    try {
      await parseBackupContent(JSON.stringify(["not", "a", "backup"]));
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).to.equal("invalidBackupFormat");
  });

  it("reports an incorrect passphrase for legacy encrypted entries", async () => {
    const hash = "11111111-1111-4111-8111-111111111111";
    const parsed = await parseBackupContent(
      JSON.stringify({
        [hash]: {
          encrypted: true,
          hash,
          index: 0,
          secret: CryptoJS.AES.encrypt(
            "JBSWY3DPEHPK3PXP",
            "correct-password"
          ).toString(),
          type: "totp",
        },
      })
    );

    let error: Error | null = null;
    try {
      await decryptParsedBackup(parsed, "wrong-password");
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).to.equal("incorrectPassphrase");
  });
});
