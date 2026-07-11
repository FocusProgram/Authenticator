import { getOTPAuthPerLineFromOPTAuthMigration } from "./migration";
import { parseOtpAuthUri } from "./otpauth-uri";
import { createRecordMap } from "./record-map";

/**
 * Parse OTP entries from otpauth:// URIs
 */
export async function getEntryDataFromOTPAuthPerLine(importCode: string) {
  const lines = importCode.split(/\r?\n/);
  const exportData = createRecordMap<RawOTPStorage>();
  let failedCount = 0;
  let succeededCount = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const item = lines[lineIndex].trim();
    if (item.toLowerCase().startsWith("otpauth-migration:")) {
      const migrationData = getOTPAuthPerLineFromOPTAuthMigration(item);
      if (!migrationData.length) {
        failedCount++;
      } else {
        lines.push(...migrationData);
      }
      continue;
    }
    if (!item.toLowerCase().startsWith("otpauth:")) {
      continue;
    }

    const parsed = parseOtpAuthUri(item);
    if (!parsed) {
      failedCount++;
      continue;
    }

    const hash = crypto.randomUUID();
    exportData[hash] = {
      account: parsed.account,
      hash,
      issuer: parsed.issuer,
      secret: parsed.secret,
      type: parsed.type,
      encrypted: false,
      index: 0,
      counter: parsed.counter || 0,
      pinned: false,
    };
    if (parsed.period) {
      exportData[hash].period = parsed.period;
    }
    if (parsed.digits) {
      exportData[hash].digits = parsed.digits;
    }
    if (parsed.algorithm) {
      exportData[hash].algorithm = parsed.algorithm;
    }

    succeededCount++;
  }

  return { exportData, failedCount, succeededCount };
}
