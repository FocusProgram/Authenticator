import "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import {
  normalizeOtpSecretForType,
  OTPEntry,
  OTPType,
  regenerateLegacyEntryHash,
} from "../../models/otp";
import { getUnresolvedEncryptionKeyIds } from "../../store/Accounts";

mocha.setup("bdd");

describe("OTP secret normalization", () => {
  it("normalizes spaced Base32 secrets and preserves the TOTP family", () => {
    const result = normalizeOtpSecretForType(
      "JBSW Y3DP EHPK 3PXP",
      OTPType.hex
    );

    expect(result).to.deep.equal({
      secret: "JBSWY3DPEHPK3PXP",
      type: OTPType.totp,
    });
  });

  it("switches HOTP entries to hexadecimal mode for hex-only secrets", () => {
    const result = normalizeOtpSecretForType("0123456789abcdef", OTPType.hotp);

    expect(result).to.deep.equal({
      secret: "0123456789abcdef",
      type: OTPType.hhex,
    });
  });

  it("rejects short or malformed secrets", () => {
    expect(normalizeOtpSecretForType("ABC", OTPType.totp)).to.equal(null);
    expect(
      normalizeOtpSecretForType("INVALID-SECRET-123", OTPType.totp)
    ).to.equal(null);
  });

  it("preserves custom periods for hexadecimal TOTP entries", () => {
    const entry = new OTPEntry({
      encrypted: false,
      index: 0,
      secret: "0123456789abcdef",
      type: OTPType.hex,
      period: 45,
    });

    expect(entry.period).to.equal(45);
  });

  it("keeps UUID v4 entry hashes unchanged during encryption migration", () => {
    const genUUID = sinon.spy();
    const entry = {
      hash: "123e4567-e89b-42d3-a456-426614174000",
      genUUID,
    };

    expect(regenerateLegacyEntryHash(entry)).to.equal(null);
    expect(genUUID.called).to.equal(false);
  });

  it("returns the old key before replacing a legacy entry hash", () => {
    const entry = {
      hash: "legacy-storage-key",
      genUUID() {
        this.hash = "123e4567-e89b-42d3-a456-426614174000";
      },
    };

    expect(regenerateLegacyEntryHash(entry)).to.equal("legacy-storage-key");
    expect(entry.hash).to.equal("123e4567-e89b-42d3-a456-426614174000");
  });

  it("counts distinct unresolved encryption keys", () => {
    const entries = [
      { secret: null, keyId: "key-a" },
      { secret: null, keyId: "key-a" },
      { secret: null, keyId: "key-b" },
      { secret: "JBSWY3DPEHPK3PXP", keyId: "key-c" },
    ] as OTPEntryInterface[];

    expect(Array.from(getUnresolvedEncryptionKeyIds(entries))).to.deep.equal([
      "key-a",
      "key-b",
    ]);
  });
});
