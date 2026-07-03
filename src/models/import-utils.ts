import * as CryptoJS from "crypto-js";

export { getEntryDataFromOTPAuthPerLine } from "./import-otpauth";
export { getEntryDataFromBitwarden } from "./import-bitwarden";

/**
 * Decrypt backup data with passphrase
 */
export async function decryptBackupData(
  backupData: { [hash: string]: OTPStorage | Key },
  passphrase: string | null
) {
  const decryptedBackupData: { [hash: string]: RawOTPStorage } = {};
  const keys: Map<string, string | null> = new Map();
  for (const hash in backupData) {
    const unknownStorageItem = backupData[hash];
    if (
      typeof unknownStorageItem !== "object" ||
      unknownStorageItem.dataType === "Key" ||
      unknownStorageItem.dataType === "Group"
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
            passphrase
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
      storageItem = unknownStorageItem;
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
  password: string
): Promise<string | null> {
  if (!(keyId in importData)) {
    return null;
  }

  const key = importData[keyId];
  if (key.dataType !== "Key" || key.id !== keyId) {
    return null;
  }

  const rawHash = await new Promise((resolve: (value: string) => void) => {
    const iframe = document.getElementById("argon-sandbox");
    const message = {
      action: "hash",
      value: password,
      salt: key.salt,
    };
    if (iframe) {
      window.addEventListener("message", (response) => {
        resolve(response.data.response);
      });
      // @ts-expect-error bad typings
      iframe.contentWindow.postMessage(message, "*");
    }
  });

  const possibleHash = rawHash.split("$")[5];
  if (!possibleHash) {
    throw new Error("argon2 did not return a hash!");
  }

  const isCorrectPassword = await new Promise(
    (resolve: (value: string) => void) => {
      const iframe = document.getElementById("argon-sandbox");
      const message = {
        action: "verify",
        value: possibleHash,
        hash: key.hash,
      };
      if (iframe) {
        window.addEventListener("message", (response) => {
          resolve(response.data.response);
        });
        // @ts-expect-error bad typings
        iframe.contentWindow.postMessage(message, "*");
      }
    }
  );

  if (!isCorrectPassword) {
    return null;
  }

  return possibleHash;
}
