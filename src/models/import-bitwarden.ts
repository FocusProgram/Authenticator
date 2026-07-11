import { parseOtpAuthUri } from "./otpauth-uri";
import { createRecordMap } from "./record-map";

interface BitwardenItem {
  folderId?: string | null;
  name?: string;
  login?: { totp?: string; username?: string };
  notes?: string;
}

interface BitwardenFolder {
  id?: string;
  name?: string;
}

/**
 * Parse OTP entries from a Bitwarden JSON export
 */
export async function getEntryDataFromBitwarden(data: {
  items?: BitwardenItem[];
  folders?: BitwardenFolder[];
}) {
  const exportData = createRecordMap<RawOTPStorage>();
  const groups = createRecordMap<GroupStorageRecord>();
  let failedCount = 0;
  let succeededCount = 0;

  for (const folder of data.folders || []) {
    const id = (folder.id || "").trim();
    const name = (folder.name || "").trim();
    if (!id || !name) {
      continue;
    }

    groups[id] = {
      dataType: "Group",
      id,
      name,
      index: Object.keys(groups).length,
    };
  }

  for (const item of data.items || []) {
    const totp = item.login?.totp;
    if (!totp) {
      continue;
    }

    let type = "totp";
    let secret: string;
    let issuer = (item.name || "").trim();
    let account = (item.login?.username || "").trim();
    let period: number | undefined;
    let digits: number | undefined;
    let algorithm: string | undefined;

    if (totp.toLowerCase().startsWith("otpauth://")) {
      const parsed = parseOtpAuthUri(totp);
      if (!parsed) {
        failedCount++;
        continue;
      }
      type = parsed.type;
      secret = parsed.secret;
      issuer = issuer || parsed.issuer;
      account = account || parsed.account;
      period = parsed.period;
      digits = parsed.digits;
      algorithm = parsed.algorithm;
    } else {
      // Plain base32 secret (may be lowercase or have spaces)
      secret = totp.replace(/\s+/g, "").toUpperCase();
    }

    if (!/^[2-7A-Z]+=*$/.test(secret) && !/^[0-9a-f]+$/i.test(secret)) {
      failedCount++;
      continue;
    }

    if (/^[0-9a-f]+$/i.test(secret) && !/^[2-7A-Z]+=*$/.test(secret)) {
      type = type === "hotp" ? "hhex" : "hex";
    }

    const hash = crypto.randomUUID();
    const entry: RawOTPStorage = {
      account,
      encrypted: false,
      hash,
      index: 0,
      issuer,
      note: (item.notes || "").trim(),
      secret,
      type,
      pinned: false,
    };

    const folderId = (item.folderId || "").trim();
    if (folderId) {
      // Preserve folder binding even if the folders array is missing or stale.
      // When the matching group record is imported, the association will still work.
      entry.groupId = folderId;
    }

    if (period) {
      entry.period = period;
    }
    if (digits) {
      entry.digits = digits;
    }
    if (algorithm) {
      entry.algorithm = algorithm;
    }

    exportData[hash] = entry;
    succeededCount++;
  }

  return { exportData, groups, failedCount, succeededCount };
}
