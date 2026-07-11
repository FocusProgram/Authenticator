import * as CryptoJS from "crypto-js";
import { throwIfImportCancelled } from "./import-cancellation";
import { argonHash, argonVerify } from "./password";
import { createRecordMap } from "./record-map";

export { getEntryDataFromOTPAuthPerLine } from "./import-otpauth";
export { getEntryDataFromBitwarden } from "./import-bitwarden";

/**
 * Decrypt backup data with passphrase
 */
export async function decryptBackupData(
  backupData: { [hash: string]: OTPStorage | Key },
  passphrase: string | null,
  keys: Map<string, string | null> = new Map(),
  signal?: AbortSignal
) {
  const decryptedBackupData = createRecordMap<RawOTPStorage>();
  for (const hash in backupData) {
    throwIfImportCancelled(signal);
    const unknownStorageItem = backupData[hash];
    if (
      typeof unknownStorageItem !== "object" ||
      unknownStorageItem.dataType === "Key" ||
      unknownStorageItem.dataType === "Group" ||
      unknownStorageItem.dataType === "EncGroup"
    ) {
      continue;
    }
    let storageItem: RawOTPStorage;
    if (unknownStorageItem.dataType === "EncOTPStorage") {
      if (!passphrase) {
        continue;
      }

      if (!keys.has(unknownStorageItem.keyId)) {
        keys.set(
          unknownStorageItem.keyId,
          await findAndUnlockKey(
            backupData,
            unknownStorageItem.keyId,
            passphrase,
            signal
          )
        );
      }
      const decryptKey = keys.get(unknownStorageItem.keyId);
      if (!decryptKey) {
        continue;
      }

      try {
        const decrypted = JSON.parse(
          CryptoJS.AES.decrypt(unknownStorageItem.data, decryptKey).toString(
            CryptoJS.enc.Utf8
          )
        );
        storageItem = {
          ...decrypted,
          hash: hash,
          index: unknownStorageItem.index,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (storageItem as any).dataType;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (storageItem as any).data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (storageItem as any).keyId;
        storageItem.encrypted = false;
      } catch (error) {
        continue;
      }
    } else {
      storageItem = { ...unknownStorageItem } as RawOTPStorage;
    }
    if (!storageItem.secret) {
      continue;
    }
    if (storageItem.encrypted && !passphrase) {
      continue;
    }
    if (storageItem.encrypted && passphrase) {
      try {
        storageItem.secret = CryptoJS.AES.decrypt(
          storageItem.secret,
          passphrase
        ).toString(CryptoJS.enc.Utf8);
        storageItem.encrypted = false;
      } catch (error) {
        continue;
      }
    }
    if (!storageItem.secret) {
      continue;
    }
    decryptedBackupData[hash] = storageItem;
  }
  return decryptedBackupData;
}

export async function decryptBackupGroups(
  backupData: { [hash: string]: OTPStorage | Key },
  passphrase: string | null,
  keys: Map<string, string | null> = new Map(),
  signal?: AbortSignal
) {
  const groups = createRecordMap<GroupStorageRecord>();

  for (const recordId of Object.keys(backupData)) {
    throwIfImportCancelled(signal);
    const record = backupData[recordId];
    if (!record || typeof record !== "object") {
      continue;
    }

    if (record.dataType === "Group") {
      if (record.id && record.name.trim()) {
        groups[record.id] = { ...record, name: record.name.trim() };
      }
      continue;
    }

    if (record.dataType !== "EncGroup" || !passphrase) {
      continue;
    }

    if (!keys.has(record.keyId)) {
      keys.set(
        record.keyId,
        await findAndUnlockKey(backupData, record.keyId, passphrase, signal)
      );
    }
    const decryptKey = keys.get(record.keyId);
    if (!decryptKey) {
      continue;
    }

    try {
      const decrypted = JSON.parse(
        CryptoJS.AES.decrypt(record.data, decryptKey).toString(
          CryptoJS.enc.Utf8
        )
      ) as GroupStorageRecord;
      if (
        decrypted.dataType === "Group" &&
        decrypted.id &&
        typeof decrypted.name === "string" &&
        decrypted.name.trim()
      ) {
        groups[decrypted.id] = {
          ...decrypted,
          name: decrypted.name.trim(),
          index: Number(decrypted.index) || 0,
        };
      }
    } catch {
      continue;
    }
  }

  return groups;
}

export function normalizeImportedEntryGroupIds(
  entries: { [hash: string]: RawOTPStorage },
  groups: OTPGroupInterface[] | { [id: string]: GroupStorageRecord }
) {
  const validGroupIds = new Set(
    Array.isArray(groups)
      ? groups.map((group) => group.id)
      : Object.keys(groups).filter((groupId) => Boolean(groups[groupId]?.name))
  );
  let normalizedCount = 0;

  for (const hash of Object.keys(entries)) {
    const entry = entries[hash];
    if (!entry?.groupId) {
      continue;
    }

    if (!validGroupIds.has(entry.groupId)) {
      delete entry.groupId;
      normalizedCount++;
    }
  }

  return normalizedCount;
}

async function findAndUnlockKey(
  importData: { [key: string]: OTPStorage | Key },
  keyId: string,
  password: string,
  signal?: AbortSignal
): Promise<string | null> {
  throwIfImportCancelled(signal);
  if (!(keyId in importData)) {
    return null;
  }

  const key = importData[keyId];
  if (key.dataType !== "Key" || key.id !== keyId) {
    return null;
  }

  const rawHash = await argonHash(password, key.salt);
  throwIfImportCancelled(signal);
  if (!rawHash) {
    throw new Error("argon2 did not return a hash!");
  }

  const possibleHash = rawHash.split("$")[5];
  if (!possibleHash) {
    throw new Error("argon2 did not return a hash!");
  }

  const isCorrectPassword = await argonVerify(possibleHash, key.hash);
  throwIfImportCancelled(signal);

  if (!isCorrectPassword) {
    return null;
  }

  return possibleHash;
}
