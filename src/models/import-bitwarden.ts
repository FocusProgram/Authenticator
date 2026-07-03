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
  const exportData: { [hash: string]: RawOTPStorage } = {};
  const groups: { [id: string]: GroupStorageRecord } = {};
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

    if (totp.startsWith("otpauth://")) {
      const parsed = parseOtpauthUri(totp);
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
      secret = totp.replace(/ /g, "").toUpperCase();
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

function parseOtpauthUri(uri: string) {
  const uriPart = uri.split("otpauth://")[1];
  const type = uriPart.substr(0, 4).toLowerCase();
  const afterType = uriPart.substr(5);
  const label = afterType.split("?")[0];
  const paramPart = afterType.split("?")[1];

  if (!paramPart) {
    return null;
  }

  let account = "";
  let issuer = "";
  try {
    const decodedLabel = decodeURIComponent(label);
    if (decodedLabel.indexOf(":") !== -1) {
      issuer = decodedLabel.split(":")[0];
      account = decodedLabel.split(":")[1];
    } else {
      account = decodedLabel;
    }
  } catch {
    account = label;
  }

  let secret = "";
  let period: number | undefined;
  let digits: number | undefined;
  let algorithm: string | undefined;

  for (const param of paramPart.split("&")) {
    const [key, val] = param.split("=");
    const k = key.toLowerCase();
    if (k === "secret") {
      secret = val;
    } else if (k === "issuer") {
      try {
        issuer = decodeURIComponent(val).replace(/\+/g, " ");
      } catch {
        issuer = val;
      }
    } else if (k === "period") {
      const p = Number(val);
      if (!isNaN(p) && p > 0 && p <= 60 && 60 % p === 0) {
        period = p;
      }
    } else if (k === "digits") {
      const d = Number(val);
      if (!isNaN(d)) {
        digits = d;
      }
    } else if (k === "algorithm") {
      algorithm = val;
    }
  }

  if (!secret) {
    return null;
  }

  return { type, secret, account, issuer, period, digits, algorithm };
}
