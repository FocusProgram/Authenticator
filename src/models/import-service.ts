import * as CryptoJS from "crypto-js";
import { Encryption } from "./encryption";
import { throwIfImportCancelled } from "./import-cancellation";
import { MAX_BACKUP_CONTENT_BYTES } from "./import-limits";
import { EntryStorage, GroupStorage, isGroupRecord } from "./storage";
import { getEntryDataFromBitwarden } from "./import-bitwarden";
import { getEntryDataFromOTPAuthPerLine } from "./import-otpauth";
import { createRecordMap } from "./record-map";
import {
  decryptBackupData,
  decryptBackupGroups,
  normalizeImportedEntryGroupIds,
} from "./import-utils";

type ImportRecordMap = Record<string, OTPStorage | Key>;

export { MAX_BACKUP_CONTENT_BYTES } from "./import-limits";

interface LegacyBackupKey {
  enc: string;
  hash?: string;
}

export interface ParsedBackup {
  records: ImportRecordMap;
  groups: { [id: string]: GroupStorageRecord };
  legacyKey: LegacyBackupKey | null;
  failedCount: number;
  succeededCount: number;
  requiresPassphrase: boolean;
  source: "json" | "bitwarden" | "otpauth";
}

export interface DecryptedBackup {
  entries: { [hash: string]: RawOTPStorage };
  groups: { [id: string]: GroupStorageRecord };
}

export interface AppliedBackupResult {
  importedEntryCount: number;
  importedGroupCount: number;
  groupedEntryCount: number;
  normalizedGroupReferenceCount: number;
  clearedEntryCount?: number;
  clearedGroupCount?: number;
}

interface ApplyDecryptedBackupOptions {
  encryption: Encryption;
  clearFirst?: boolean;
  onProgress?: (value: number, label: string) => void;
  refresh?: () => Promise<void>;
  signal?: AbortSignal;
}

export function assertBackupContentSize(
  content: string,
  maxBytes = MAX_BACKUP_CONTENT_BYTES
) {
  if (new Blob([content]).size > maxBytes) {
    throw new Error("backupContentTooLarge");
  }
}

export async function parseBackupContent(content: string) {
  assertBackupContentSize(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    const result = await getEntryDataFromOTPAuthPerLine(content);
    return createParsedBackup(
      result.exportData,
      createRecordMap<GroupStorageRecord>(),
      null,
      result.failedCount,
      result.succeededCount,
      "otpauth"
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalidBackupFormat");
  }

  if (
    "items" in parsed &&
    Array.isArray((parsed as { items?: unknown }).items)
  ) {
    const bitwardenResult = await getEntryDataFromBitwarden(
      parsed as Parameters<typeof getEntryDataFromBitwarden>[0]
    );
    return createParsedBackup(
      bitwardenResult.exportData,
      bitwardenResult.groups,
      null,
      bitwardenResult.failedCount,
      bitwardenResult.succeededCount,
      "bitwarden"
    );
  }

  const records = createRecordMap(
    parsed as ImportRecordMap
  ) as ImportRecordMap & {
    key?: LegacyBackupKey;
    enc?: string;
    hash?: string;
  };
  const groups = createRecordMap<GroupStorageRecord>();
  let legacyKey: LegacyBackupKey | null = null;

  if (isLegacyBackupKey(records.key)) {
    legacyKey = records.key;
    delete records.key;
  } else if (
    typeof records.enc === "string" &&
    typeof records.hash === "string"
  ) {
    legacyKey = { enc: records.enc, hash: records.hash };
    delete records.enc;
    delete records.hash;
  }

  for (const recordId of Object.keys(records)) {
    const record = records[recordId];
    if (isGroupRecord(record)) {
      groups[recordId] = record;
      delete records[recordId];
    }
  }

  return createParsedBackup(
    records,
    groups,
    legacyKey,
    0,
    countOtpRecords(records),
    "json"
  );
}

export async function decryptParsedBackup(
  backup: ParsedBackup,
  passphrase: string | null,
  signal?: AbortSignal
): Promise<DecryptedBackup> {
  throwIfImportCancelled(signal);
  if (backup.requiresPassphrase && !passphrase) {
    throw new Error("passphraseRequired");
  }

  const unlockKey =
    backup.legacyKey && passphrase
      ? CryptoJS.AES.decrypt(backup.legacyKey.enc, passphrase).toString()
      : passphrase;
  if (backup.legacyKey && passphrase && !unlockKey) {
    throw new Error("incorrectPassphrase");
  }

  const unlockedKeys = new Map<string, string | null>();
  const entries = await decryptBackupData(
    backup.records,
    unlockKey,
    unlockedKeys,
    signal
  );
  const encryptedGroups = await decryptBackupGroups(
    backup.records,
    unlockKey,
    unlockedKeys,
    signal
  );
  throwIfImportCancelled(signal);

  const encryptedKeyRecords = Object.values(backup.records).filter(
    (record) =>
      record?.dataType === "EncOTPStorage" || record?.dataType === "EncGroup"
  );
  if (
    encryptedKeyRecords.length &&
    unlockedKeys.size > 0 &&
    !Array.from(unlockedKeys.values()).some(Boolean)
  ) {
    throw new Error("incorrectPassphrase");
  }

  const legacyEncryptedHashes = Object.keys(backup.records).filter((hash) => {
    const record = backup.records[hash];
    return (
      record &&
      typeof record === "object" &&
      "encrypted" in record &&
      Boolean(record.encrypted)
    );
  });
  if (
    legacyEncryptedHashes.length &&
    !legacyEncryptedHashes.some((hash) => Boolean(entries[hash]))
  ) {
    throw new Error("incorrectPassphrase");
  }

  return {
    entries,
    groups: Object.assign(
      createRecordMap<GroupStorageRecord>(),
      backup.groups,
      encryptedGroups
    ),
  };
}

export async function applyDecryptedBackup(
  backup: DecryptedBackup,
  options: ApplyDecryptedBackupOptions
): Promise<AppliedBackupResult> {
  throwIfImportCancelled(options.signal);
  const entries = Object.keys(backup.entries).reduce(
    (result: { [hash: string]: RawOTPStorage }, hash) => {
      result[hash] = { ...backup.entries[hash] };
      return result;
    },
    createRecordMap<RawOTPStorage>()
  );
  if (!Object.keys(entries).length) {
    throw new Error("noImportableEntries");
  }

  const importedGroups = GroupStorage.getImportGroups(backup.groups);
  let clearedEntryCount: number | undefined;
  let clearedGroupCount: number | undefined;
  let normalizedGroupReferenceCount = 0;
  let storageResult: {
    importedEntryCount: number;
    importedGroupCount: number;
  };

  if (options.clearFirst) {
    throwIfImportCancelled(options.signal);
    const [existingEntries, existingGroups] = await Promise.all([
      EntryStorage.get(),
      GroupStorage.get(),
    ]);
    clearedEntryCount = existingEntries.length;
    clearedGroupCount = existingGroups.length;
    normalizedGroupReferenceCount = normalizeImportedEntryGroupIds(
      entries,
      importedGroups
    );
    options.onProgress?.(74, "ui_progress_replacing_data");
    throwIfImportCancelled(options.signal);
    storageResult = await EntryStorage.replaceImport(
      options.encryption,
      entries,
      backup.groups
    );
  } else {
    throwIfImportCancelled(options.signal);
    const availableGroups = GroupStorage.mergeImportGroups(
      await GroupStorage.get(),
      importedGroups
    );
    normalizedGroupReferenceCount = normalizeImportedEntryGroupIds(
      entries,
      availableGroups
    );
    options.onProgress?.(76, "ui_progress_merging_data");
    throwIfImportCancelled(options.signal);
    storageResult = await EntryStorage.mergeImport(
      options.encryption,
      entries,
      backup.groups
    );
  }

  if (options.refresh) {
    options.onProgress?.(93, "ui_progress_refreshing");
    await options.refresh();
  }

  return {
    ...storageResult,
    groupedEntryCount: Object.values(entries).filter((entry) =>
      Boolean(entry.groupId)
    ).length,
    normalizedGroupReferenceCount,
    clearedEntryCount,
    clearedGroupCount,
  };
}

function createParsedBackup(
  records: ImportRecordMap,
  groups: { [id: string]: GroupStorageRecord },
  legacyKey: LegacyBackupKey | null,
  failedCount: number,
  succeededCount: number,
  source: ParsedBackup["source"]
): ParsedBackup {
  return {
    records,
    groups,
    legacyKey,
    failedCount,
    succeededCount,
    requiresPassphrase: Object.values(records).some(isEncryptedRecord),
    source,
  };
}

function isEncryptedRecord(record: OTPStorage | Key) {
  if (!record || typeof record !== "object") {
    return false;
  }
  if (record.dataType === "EncOTPStorage" || record.dataType === "EncGroup") {
    return true;
  }
  return "encrypted" in record && Boolean(record.encrypted);
}

function isLegacyBackupKey(record: unknown): record is LegacyBackupKey {
  return Boolean(
    record &&
      typeof record === "object" &&
      "enc" in record &&
      typeof record.enc === "string" &&
      record.enc
  );
}

function countOtpRecords(records: ImportRecordMap) {
  return Object.values(records).filter((record) => {
    if (!record || typeof record !== "object") {
      return false;
    }
    return (
      record.dataType === "EncOTPStorage" ||
      ("secret" in record && Boolean(record.secret))
    );
  }).length;
}
