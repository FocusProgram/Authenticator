import { buildOtpAuthUri, getDisplayIssuer } from "./otpauth-uri";

type BackupRecord =
  | RawOTPStorage
  | EncOTPStorage
  | GroupStorageRecord
  | EncGroupStorageRecord
  | Key
  | OldKey;

export function hasUnsupportedAccounts(exportData: {
  [hash: string]: RawOTPStorage;
}) {
  return Object.values(exportData).some(
    (entry) => entry.type === "battle" || entry.type === "steam"
  );
}

export function getGroupExportData(groups: OTPGroupInterface[]) {
  return groups.reduce(
    (records: { [id: string]: GroupStorageRecord }, group) => {
      records[group.id] = {
        dataType: "Group",
        id: group.id,
        name: group.name,
        index: group.index,
      };
      return records;
    },
    {}
  );
}

export function getEncryptedGroupExportData(
  groups: OTPGroupInterface[],
  encryption: EncryptionInterface | null
) {
  const records: { [id: string]: EncGroupStorageRecord } = {};
  if (!encryption?.getEncryptionStatus() || !encryption.getEncryptionKeyId()) {
    return records;
  }

  for (const group of groups) {
    const plainRecord: GroupStorageRecord = {
      dataType: "Group",
      id: group.id,
      name: group.name,
      index: group.index,
    };
    records[group.id] = {
      dataType: "EncGroup",
      keyId: encryption.getEncryptionKeyId(),
      data: encryption.getEncryptedString(JSON.stringify(plainRecord)),
      index: group.index,
    };
  }

  return records;
}

export function buildBackupJson(entryData: { [hash: string]: BackupRecord }) {
  return JSON.stringify(entryData, null, 2).replace(/\n/g, "\r\n");
}

export function buildOtpAuthText(entryData: { [hash: string]: RawOTPStorage }) {
  const otpAuthLines: string[] = [];

  for (const otpStorage of Object.values(entryData)) {
    const otpAuthUri = buildOtpAuthUri(otpStorage);
    if (otpAuthUri) {
      otpAuthLines.push(otpAuthUri);
    }
  }

  return otpAuthLines.join("\r\n");
}

export function buildCsvBackup(
  entryData: { [hash: string]: RawOTPStorage },
  groups: OTPGroupInterface[]
) {
  const csvRows = ["title,url,username,password,issuer,group,secret,notes"];
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  for (const otpStorage of Object.values(entryData)) {
    const otpAuthUrl = buildOtpAuthUri(otpStorage);
    if (!otpAuthUrl) {
      continue;
    }

    const issuer = getDisplayIssuer(otpStorage.issuer || "");
    const account = (otpStorage.account || "").trim();
    const secret = otpStorage.secret || "";
    const groupName = otpStorage.groupId
      ? groupNames.get(otpStorage.groupId) || ""
      : "";
    const note = otpStorage.note || "";

    csvRows.push(
      [
        issuer || account || "Authenticator Entry",
        "",
        account,
        "",
        issuer,
        groupName,
        secret,
        [note, otpAuthUrl].filter(Boolean).join("\n"),
      ]
        .map(escapeCsvField)
        .join(",")
    );
  }

  return csvRows.join("\r\n");
}

function escapeCsvField(field: string) {
  if (!field) {
    return "";
  }
  const safeField = /^[=+\-@\t]/.test(field) ? `'${field}` : field;
  if (
    safeField.includes('"') ||
    safeField.includes(",") ||
    safeField.includes("\n") ||
    safeField.includes("\r")
  ) {
    return '"' + safeField.replace(/"/g, '""') + '"';
  }
  return safeField;
}
