import "mocha";
import { expect } from "chai";
import { buildOtpAuthUri, parseOtpAuthUri } from "../../models/otpauth-uri";

mocha.setup("bdd");

describe("otpauth URI utilities", () => {
  it("round-trips colons inside issuer and account names", () => {
    const uri = buildOtpAuthUri({
      type: "totp",
      issuer: "Acme:Cloud",
      account: "user:production",
      secret: "JBSWY3DPEHPK3PXP",
    });

    expect(uri).to.equal(
      "otpauth://totp/Acme%3ACloud:user%3Aproduction?secret=JBSWY3DPEHPK3PXP&issuer=Acme%3ACloud"
    );
    expect(parseOtpAuthUri(uri || "")).to.include({
      issuer: "Acme:Cloud",
      account: "user:production",
    });
  });

  it("omits the internal issuer host suffix from exported labels", () => {
    const uri = buildOtpAuthUri({
      type: "totp",
      issuer: "Example::login.example.com",
      account: "user@example.com",
      secret: "JBSWY3DPEHPK3PXP",
    });

    expect(uri).to.contain("/Example:user%40example.com?");
    expect(uri).to.not.contain("login.example.com");
  });

  it("preserves a custom period for hexadecimal TOTP entries", () => {
    const uri = buildOtpAuthUri({
      type: "hex",
      issuer: "Hex",
      account: "timer",
      secret: "0123456789abcdef",
      period: 45,
    });
    const parsed = parseOtpAuthUri(uri || "");

    expect(uri).to.contain("&period=45");
    expect(parsed?.type).to.equal("hex");
    expect(parsed?.period).to.equal(45);
  });

  it("parses HOTP counters and query issuer values", () => {
    const parsed = parseOtpAuthUri(
      "otpauth://hotp/account?secret=JBSWY3DPEHPK3PXP&issuer=Example+Team&counter=12"
    );

    expect(parsed).to.include({
      type: "hotp",
      issuer: "Example Team",
      account: "account",
      counter: 12,
    });
  });

  it("rejects unsupported schemes and malformed secrets", () => {
    expect(parseOtpAuthUri("https://example.com")).to.equal(null);
    expect(
      parseOtpAuthUri("otpauth://totp/account?secret=invalid-secret")
    ).to.equal(null);
  });
});
