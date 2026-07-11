import { Encryption } from "./encryption";
import { OTPEntry, OTPType, OTPAlgorithm, CodeState } from "./otp";
import { StorageLocation, UserSettings } from "./settings";
import { DataType } from "./otp";
import { createRecordMap, isUnsafeRecordKey } from "./record-map";
export class BrowserStorage {
  private static async getStorageLocation(): Promise<StorageLocation> {
    await UserSettings.updateItems();
    const managedLocation = await ManagedStorage.get<StorageLocation>(
      "storageArea"
    );
    if (
      managedLocation === StorageLocation.Sync ||
      managedLocation === StorageLocation.Local
    ) {
      return new Promise((resolve) => {
        if (UserSettings.items.storageLocation !== managedLocation) {
          UserSettings.items.storageLocation = managedLocation;
          UserSettings.commitItems();
        }
        resolve(managedLocation);
        return;
      });
    } else if (
      UserSettings.items.storageLocation !== StorageLocation.Sync &&
      UserSettings.items.storageLocation !== StorageLocation.Local
    ) {
      return new Promise((resolve, reject) => {
        let amountSync: number;
        let amountLocal: number;
        chrome.storage.local.get((local) => {
          amountLocal = Object.keys(local).length;
          if (local.LocalStorage) {
            amountLocal--;
          }
          try {
            chrome.storage.sync.get((sync) => {
              amountSync = Object.keys(sync).length;
              // If storage location can't be found try to auto-detect storage
              // location
              if (amountLocal > amountSync && amountSync === 0) {
                UserSettings.items.storageLocation = StorageLocation.Local;
              } else if (amountLocal < amountSync && amountLocal === 0) {
                UserSettings.items.storageLocation = StorageLocation.Sync;
              } else {
                // Use default
                UserSettings.items.storageLocation = StorageLocation.Sync;
              }
              UserSettings.commitItems();
              resolve(UserSettings.items.storageLocation);
              return;
            });
          } catch (error) {
            reject(error);
            return;
          }
        });
      });
    } else {
      return new Promise((resolve) => {
        resolve(UserSettings.items.storageLocation || StorageLocation.Sync);
        return;
      });
    }
  }

  // TODO: promise this
  static async get() {
    const storageLocation = await this.getStorageLocation();
    const removeOtherData = function (items: Record<string, unknown>): void {
      delete items.key;
      delete items.LocalStorage;

      for (const itemId in items) {
        const item = items[itemId];

        if (
          item !== null &&
          typeof item === "object" &&
          "dataType" in item &&
          item.dataType === "Key"
        ) {
          delete items[itemId];
        }
      }
    };

    let items = {} as { [key: string]: OTPStorage };

    if (storageLocation === "local") {
      items = await chrome.storage.local.get();
    } else if (storageLocation === "sync") {
      items = await chrome.storage.sync.get();
    }

    removeOtherData(items);

    return items;
  }

  static async getKeys(): Promise<OldKey | Key[]> {
    const storageLocation = await this.getStorageLocation();

    const data = (await chrome.storage[storageLocation].get()) as Record<
      string,
      unknown
    >;

    // Return old key first, so we know to run a migration
    if (data && typeof data === "object" && "key" in data) {
      if (isOldKey(data.key)) {
        return data.key;
      } else {
        console.error("'key' is malformed!");
      }
    }

    const keys: Key[] = [];
    if (data && typeof data === "object") {
      for (const record in data) {
        const key = data[record];
        if (isKey(key)) {
          keys.push(key);
        }
      }
    }

    return keys;
  }

  static async set(data: object) {
    const storageLocation = await this.getStorageLocation();
    if (storageLocation === StorageLocation.Local) {
      await chrome.storage.local.set(data);
    } else if (storageLocation === StorageLocation.Sync) {
      const entries = Object.entries(data);
      const chunkSize = 25;

      for (let index = 0; index < entries.length; index += chunkSize) {
        const chunk = Object.fromEntries(
          entries.slice(index, index + chunkSize)
        );
        await chrome.storage.sync.set(chunk);
      }
    }
    return;
  }

  static async remove(data: string | string[]) {
    const storageLocation = await this.getStorageLocation();
    if (storageLocation === "local") {
      await chrome.storage.local.remove(data);
    } else if (storageLocation === "sync") {
      await chrome.storage.sync.remove(data);
    }
    return;
  }

  static async commitOtpAndGroupChanges(
    data: { [key: string]: OTPStorage },
    removeKeys: string[] = [],
    currentData?: { [key: string]: OTPStorage }
  ) {
    const nextKeys = Object.keys(data);
    const nextKeySet = new Set(nextKeys);
    const keysToRemove = Array.from(new Set(removeKeys)).filter(
      (key) => !nextKeySet.has(key)
    );
    const transactionKeys = Array.from(new Set([...nextKeys, ...keysToRemove]));
    if (!transactionKeys.length) {
      return;
    }
    const previousSnapshot = currentData || (await this.get());
    const previousData = transactionKeys.reduce(
      (records: { [key: string]: OTPStorage }, key) => {
        if (Object.prototype.hasOwnProperty.call(previousSnapshot, key)) {
          records[key] = previousSnapshot[key];
        }
        return records;
      },
      {}
    );

    try {
      if (keysToRemove.length) {
        await this.remove(keysToRemove);
      }
      if (nextKeys.length) {
        await this.set(data);
      }

      const storedData = await this.get();
      if (
        !nextKeys.every((key) =>
          Object.prototype.hasOwnProperty.call(storedData, key)
        ) ||
        keysToRemove.some((key) =>
          Object.prototype.hasOwnProperty.call(storedData, key)
        )
      ) {
        throw new Error("storageIncompleteWrite");
      }
    } catch (error) {
      try {
        if (transactionKeys.length) {
          await this.remove(transactionKeys);
        }
        if (Object.keys(previousData).length) {
          await this.set(previousData);
        }
      } catch (rollbackError) {
        console.error(
          "Failed to restore data after storage error:",
          rollbackError
        );
      }
      throw error;
    }
  }

  static async assertImportKeysAreSafe(keys: string[]) {
    const protectedKeys = new Set(["UserSettings", "LocalStorage", "key"]);
    const encryptionKeys = await this.getKeys();
    if (!isOldKey(encryptionKeys)) {
      for (const key of encryptionKeys) {
        protectedKeys.add(key.id);
      }
    }

    if (keys.some((key) => protectedKeys.has(key))) {
      throw new Error("importSystemKeyConflict");
    }
  }

  static async assertImportPayloadIsSafe(
    data: { [key: string]: OTPStorage },
    allowReplacingOtpAndGroup = false
  ) {
    const keys = Object.keys(data);
    await this.assertImportKeysAreSafe(keys);
    const currentData = await this.get();

    for (const key of keys) {
      const incomingKind = getOtpOrGroupRecordKind(data[key]);
      if (!incomingKind) {
        throw new Error("importUnknownRecord");
      }

      if (!(key in currentData)) {
        continue;
      }

      const existingKind = getOtpOrGroupRecordKind(currentData[key]);
      if (
        !existingKind ||
        (!allowReplacingOtpAndGroup && existingKind !== incomingKind)
      ) {
        throw new Error("importTypeConflict");
      }
    }
  }

  static async replaceOtpAndGroupData(data: { [key: string]: OTPStorage }) {
    const currentData = await this.get();
    const previousData = Object.keys(currentData).reduce(
      (records: { [key: string]: OTPStorage }, key) => {
        if (isOtpOrGroupRecord(currentData[key])) {
          records[key] = currentData[key];
        }
        return records;
      },
      {}
    );
    const previousKeys = Object.keys(previousData);
    const nextKeys = Object.keys(data);
    await this.assertImportPayloadIsSafe(data, true);
    const transactionKeys = Array.from(new Set([...previousKeys, ...nextKeys]));

    try {
      if (previousKeys.length) {
        await this.remove(previousKeys);
      }
      if (nextKeys.length) {
        await this.set(data);
      }

      const storedData = await this.get();
      if (!nextKeys.every((key) => key in storedData)) {
        throw new Error("importIncompleteWrite");
      }
    } catch (error) {
      try {
        if (transactionKeys.length) {
          await this.remove(transactionKeys);
        }
        if (previousKeys.length) {
          await this.set(previousData);
        }
      } catch (rollbackError) {
        console.error(
          "Failed to restore data after import error:",
          rollbackError
        );
      }

      throw error;
    }
  }

  static async mergeOtpAndGroupData(data: { [key: string]: OTPStorage }) {
    const previousData = await this.get();
    await this.assertImportPayloadIsSafe(data);
    const transactionKeys = Array.from(
      new Set([...Object.keys(previousData), ...Object.keys(data)])
    );

    try {
      if (Object.keys(data).length) {
        await this.set(data);
      }

      const storedData = await this.get();
      if (!Object.keys(data).every((key) => key in storedData)) {
        throw new Error("importIncompleteWrite");
      }
    } catch (error) {
      try {
        if (transactionKeys.length) {
          await this.remove(transactionKeys);
        }
        if (Object.keys(previousData).length) {
          await this.set(previousData);
        }
      } catch (rollbackError) {
        console.error(
          "Failed to restore data after import error:",
          rollbackError
        );
      }

      throw error;
    }
  }

  static async clearOtpAndGroupData() {
    const currentData = await this.get();
    const keysToRemove: string[] = [];
    let clearedEntryCount = 0;
    let clearedGroupCount = 0;

    for (const key of Object.keys(currentData)) {
      const kind = getOtpOrGroupRecordKind(currentData[key]);
      if (!kind) {
        continue;
      }
      keysToRemove.push(key);
      if (kind === "otp") {
        clearedEntryCount++;
      } else {
        clearedGroupCount++;
      }
    }

    await this.commitOtpAndGroupChanges({}, keysToRemove, currentData);
    return { clearedEntryCount, clearedGroupCount };
  }

  // Use for Chrome only.
  // https://github.com/Authenticator-Extension/Authenticator/issues/412
  static async clearLogs() {
    const storageLocation = await this.getStorageLocation();
    if (storageLocation === "local") {
      const data = await chrome.storage.local.get();
      await chrome.storage.local.clear();
      await chrome.storage.local.set(data);
    } else if (storageLocation === "sync") {
      const data = await chrome.storage.sync.get();
      await chrome.storage.sync.clear();
      await chrome.storage.sync.set(data);
    }
  }
}

export function isOldKey(key: unknown): key is OldKey {
  return Boolean(
    key &&
      typeof key === "object" &&
      "enc" in key &&
      "hash" in key &&
      key.enc &&
      key.hash &&
      typeof key.enc === "string" &&
      typeof key.hash === "string"
  );
}

function isKey(key: unknown): key is Key {
  return Boolean(
    key &&
      typeof key === "object" &&
      "dataType" in key &&
      "id" in key &&
      "salt" in key &&
      key.dataType === "Key" &&
      key.id &&
      key.salt &&
      typeof key.id === "string" &&
      typeof key.salt === "string"
  );
}

export function isGroupRecord(group: unknown): group is GroupStorageRecord {
  return Boolean(
    group &&
      typeof group === "object" &&
      "dataType" in group &&
      "id" in group &&
      "name" in group &&
      "index" in group &&
      group.dataType === DataType.Group &&
      typeof group.id === "string" &&
      typeof group.name === "string" &&
      typeof group.index === "number"
  );
}

function isOtpOrGroupRecord(record: unknown): record is OTPStorage {
  return getOtpOrGroupRecordKind(record) !== null;
}

function getOtpOrGroupRecordKind(record: unknown): "otp" | "group" | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  if ("dataType" in record) {
    if (
      record.dataType === DataType.OTPStorage ||
      record.dataType === DataType.EncOTPStorage
    ) {
      return "otp";
    }
    if (
      record.dataType === DataType.Group ||
      record.dataType === DataType.EncGroup
    ) {
      return "group";
    }
    return null;
  }

  return "secret" in record ? "otp" : null;
}

function normalizeGroups(groups: OTPGroupInterface[]): OTPGroupInterface[] {
  return groups
    .filter((group) => group && group.id && group.name.trim())
    .sort((a, b) => a.index - b.index)
    .map((group, index) => ({
      id: group.id,
      name: group.name.trim(),
      index,
    }));
}

export class EntryStorage {
  private static getOTPStorageFromEntry(
    entry: OTPEntry,
    unencrypted?: boolean
  ): OTPStorage {
    let secret: string;
    if (!entry.secret && entry.encData && entry.keyId) {
      return {
        dataType: DataType.EncOTPStorage,
        keyId: entry.keyId,
        data: entry.encData,
        index: entry.index,
      };
    } else if (entry.secret) {
      secret = entry.secret;
    } else {
      secret = "";
      console.warn("Invalid entry", entry);
    }

    let encrypted = entry.encryption?.getEncryptionStatus() || false;

    if (unencrypted && entry.secret) {
      secret = entry.secret;
      encrypted = false;
    }

    // entry.type is already a string like "totp", don't convert it
    const typeString =
      typeof entry.type === "number" ? OTPType[entry.type] : entry.type;
    const storageItem: RawOTPStorage = {
      encrypted,
      hash: entry.hash,
      index: entry.index,
      type: typeString,
      secret,
    };

    if (entry.pinned) {
      storageItem.pinned = true;
    }

    if (entry.type === OTPType.hotp || entry.type === OTPType.hhex) {
      storageItem.counter = entry.counter;
    }

    if (entry.period && entry.period !== 30) {
      storageItem.period = entry.period;
    }

    if (entry.issuer) {
      storageItem.issuer = entry.issuer;
    }

    if (entry.account) {
      storageItem.account = entry.account;
    }

    if (entry.note) {
      storageItem.note = entry.note;
    }

    if (entry.groupId) {
      storageItem.groupId = entry.groupId;
    }

    if (entry.digits && entry.digits !== 6) {
      storageItem.digits = entry.digits;
    }

    if (entry.algorithm && entry.algorithm !== OTPAlgorithm.SHA1) {
      storageItem.algorithm = OTPAlgorithm[entry.algorithm];
    }

    if (entry.encryption?.getEncryptionKeyId()) {
      storageItem.keyId = entry.encryption.getEncryptionKeyId();
    }

    storageItem.dataType = DataType.OTPStorage;

    if (
      !unencrypted &&
      encrypted &&
      entry.encryption?.getEncryptionStatus() &&
      entry.encryption.getEncryptionKeyId()
    ) {
      const encData = entry.encryption.getEncryptedString(
        JSON.stringify(storageItem)
      );
      return {
        dataType: DataType.EncOTPStorage,
        data: encData,
        keyId: entry.encryption.getEncryptionKeyId(),
        index: entry.index,
      };
    } else if (encrypted) {
      console.error("Could not encrypt malformed entry: ", entry);
    }

    return storageItem;
  }

  private static ensureUniqueIndex(data: { [hash: string]: OTPStorage }) {
    const tempEntryArray: [hash: string, storage: OTPStorage][] = [];

    for (const hash of Object.keys(data)) {
      if (
        hash === "UserSettings" ||
        (data[hash] as { dataType: string }).dataType === "Key" ||
        getOtpOrGroupRecordKind(data[hash]) !== "otp" ||
        !this.isValidEntry(data, hash)
      ) {
        continue;
      }
      tempEntryArray.push([hash, data[hash]]);
    }

    tempEntryArray.sort((a, b) => {
      return a[1].index - b[1].index;
    });

    let i = 0;
    const newData: { [hash: string]: OTPStorage } = tempEntryArray.reduce(
      (previous: { [hash: string]: OTPStorage }, entry) => {
        const mergedData = {
          ...previous,
          [entry[0]]: { ...entry[1], index: i },
        };

        i += 1;

        return mergedData;
      },
      {}
    );

    return newData;
  }

  private static isOTPStorage(entry: unknown) {
    if (typeof entry !== "object") {
      return false;
    }

    if (!entry || !("secret" in entry || "data" in entry)) {
      return false;
    }

    return true;
  }

  private static isValidEntry(
    _data: { [hash: string]: OTPStorage },
    hash: string
  ) {
    if (typeof _data[hash] !== "object") {
      console.log('Key "' + hash + '" is not an object');
      return false;
    } else {
      if (!this.isOTPStorage(_data[hash])) {
        console.log('Key "' + hash + '" is not OTPStorage');
        return false;
      }
      return true;
    }
  }

  static async hasEncryptionKey(): Promise<boolean> {
    const keys = await BrowserStorage.getKeys();
    if (isOldKey(keys)) {
      return true;
    } else {
      return keys.length !== 0;
    }
  }

  static getExport(data: OTPEntryInterface[], encrypted?: boolean) {
    try {
      const exportData: { [hash: string]: OTPStorage } = {};
      for (const entry of data) {
        // Skip unable-decrypted data
        if (entry.code === CodeState.Encrypted || !entry.secret) {
          continue;
        }

        exportData[entry.hash] = this.getOTPStorageFromEntry(entry, !encrypted);
      }
      return exportData;
    } catch (error) {
      console.error("Error in getExport:", error);
      return error;
    }
  }

  static async backupGetExport(encryption: Encryption, encrypted?: boolean) {
    const rawData = await BrowserStorage.get();
    const exportData: { [hash: string]: OTPStorage | Key | OldKey } = {};

    for (const hash of Object.keys(rawData)) {
      const storageItem = rawData[hash];

      if (isGroupRecord(storageItem)) {
        if (
          encrypted &&
          encryption.getEncryptionStatus() &&
          encryption.getEncryptionKeyId()
        ) {
          exportData[hash] = {
            dataType: DataType.EncGroup,
            keyId: encryption.getEncryptionKeyId(),
            data: encryption.getEncryptedString(JSON.stringify(storageItem)),
            index: storageItem.index,
          };
        } else {
          exportData[hash] = { ...storageItem };
        }
        continue;
      }

      if (storageItem.dataType === DataType.EncGroup) {
        continue;
      }

      if (
        hash === "UserSettings" ||
        (storageItem as { dataType?: string }).dataType === DataType.Key ||
        !this.isValidEntry(rawData, hash)
      ) {
        continue;
      }

      if (storageItem.dataType === DataType.EncOTPStorage) {
        if (encrypted) {
          exportData[hash] = { ...storageItem };
          continue;
        }

        if (encryption && encryption.getEncryptionStatus()) {
          try {
            const tempEntry = ({
              encData: storageItem.data,
              keyId: storageItem.keyId,
            } as unknown) as OTPEntryInterface;
            const decrypted = encryption.decryptEncSecret(tempEntry);
            if (decrypted && decrypted.secret) {
              const plainData = {
                ...decrypted,
                encrypted: false,
                dataType: DataType.OTPStorage,
              };
              delete plainData.keyId;
              exportData[hash] = plainData;
            }
          } catch (error) {
            console.error("Failed to decrypt EncOTPStorage:", error);
          }
        }
        continue;
      }

      const entry = { ...storageItem };

      if (
        encrypted &&
        encryption &&
        encryption.getEncryptionStatus() &&
        entry.dataType === DataType.OTPStorage &&
        !entry.encrypted
      ) {
        try {
          const typeNum =
            typeof entry.type === "string"
              ? (parseInt(entry.type) as OTPType) ||
                (OTPType[entry.type as keyof typeof OTPType] as OTPType) ||
                OTPType.totp
              : entry.type;

          let algorithmNum = OTPAlgorithm.SHA1;
          if (entry.algorithm) {
            algorithmNum =
              typeof entry.algorithm === "string"
                ? (parseInt(entry.algorithm) as OTPAlgorithm) ||
                  (OTPAlgorithm[
                    entry.algorithm as keyof typeof OTPAlgorithm
                  ] as OTPAlgorithm) ||
                  OTPAlgorithm.SHA1
                : entry.algorithm;
          }

          const entryData = {
            ...entry,
            type: typeNum,
            algorithm: algorithmNum,
            encrypted: false as const,
          };

          const otpEntry = new OTPEntry(entryData, encryption);
          const encryptedStorage = this.getOTPStorageFromEntry(otpEntry);
          if (encryptedStorage.dataType === DataType.EncOTPStorage) {
            exportData[hash] = encryptedStorage;
            continue;
          }
        } catch (error) {
          console.error("Failed to encrypt entry for export:", error);
        }
      }

      if (
        !(entry.type === OTPType[OTPType.hotp]) &&
        !(entry.type === OTPType[OTPType.hhex])
      ) {
        delete entry.counter;
      }

      if (entry.period === 30) {
        delete entry.period;
      }

      if (!entry.issuer) {
        delete entry.issuer;
      }

      if (!entry.account) {
        delete entry.account;
      }

      if (!entry.note) {
        delete entry.note;
      }

      if (!entry.groupId) {
        delete entry.groupId;
      }

      if (entry.digits === 6) {
        delete entry.digits;
      }

      if (entry.algorithm === OTPAlgorithm[OTPAlgorithm.SHA1]) {
        delete entry.algorithm;
      }

      delete entry.pinned;

      if (!encrypted) {
        delete entry.keyId;

        if (entry.encrypted) {
          const decryptedSecret = encryption.decryptSecretString(entry.secret);
          if (decryptedSecret !== entry.secret && decryptedSecret !== null) {
            entry.secret = decryptedSecret;
            entry.encrypted = false;
          }
        }

        exportData[entry.hash || hash] = entry;
      } else {
        exportData[hash] = entry;
      }
    }

    if (encrypted && encryption.getEncryptionStatus()) {
      const keys = await BrowserStorage.getKeys();
      if (isOldKey(keys)) {
        Object.assign(exportData, { key: keys });
      } else {
        for (const key of keys) {
          Object.assign(exportData, { [key.id]: key });
        }
      }
    }

    return exportData;
  }

  static getImportPayload(
    encryption: Encryption,
    data: { [hash: string]: RawOTPStorage },
    reservedOtpHashes: Set<string> = new Set()
  ) {
    const payload = createRecordMap<OTPStorage>();
    for (const hash of Object.keys(data)) {
      // never trust data import from user
      // data must be decrypted before calling this method
      if (!data[hash].secret || data[hash].encrypted) {
        // TODO: we need give a failed warning
        continue;
      }

      const rawType = data[hash].type;
      const parsedType = parseInt(rawType) as OTPType;
      const normalizedType =
        parsedType ||
        (OTPType[rawType as keyof typeof OTPType] as OTPType) ||
        OTPType.totp;
      const rawAlgorithm = data[hash].algorithm;
      const parsedAlgorithm = rawAlgorithm
        ? (parseInt(rawAlgorithm) as OTPAlgorithm)
        : OTPAlgorithm.SHA1;
      const normalizedAlgorithm = rawAlgorithm
        ? parsedAlgorithm ||
          (OTPAlgorithm[
            rawAlgorithm as keyof typeof OTPAlgorithm
          ] as OTPAlgorithm) ||
          OTPAlgorithm.SHA1
        : OTPAlgorithm.SHA1;
      const entryData: {
        account: string;
        encrypted: false;
        index: number;
        issuer: string;
        note?: string;
        groupId?: string;
        secret: string;
        type: OTPType;
        counter: number;
        period: number;
        hash: string;
        digits: number;
        algorithm: OTPAlgorithm;
        pinned: boolean;
      } = {
        type: normalizedType,
        index: data[hash].index || 0,
        issuer: data[hash].issuer || "",
        note: data[hash].note || "",
        groupId: data[hash].groupId,
        account: data[hash].account || "",
        encrypted: false,
        secret: data[hash].secret,
        counter: data[hash].counter || 0,
        period: data[hash].period || 30,
        digits: data[hash].digits || 6,
        algorithm: normalizedAlgorithm,
        pinned: data[hash].pinned || false,
        hash: data[hash].hash || hash,
      };

      if (isNaN(entryData.period) || entryData.period <= 0) {
        entryData.period = 30;
      }

      // If invalid digits, then use default.
      if (entryData.digits > 10 || entryData.digits < 1) {
        entryData.digits = 6;
      }

      // If invalid algorithm, then use default
      if (!OTPAlgorithm[entryData.algorithm]) {
        entryData.algorithm = OTPAlgorithm.SHA1;
      }

      if (/^(blz-|bliz-)/.test(entryData.secret)) {
        const secretMatches = entryData.secret.match(/^(blz-|bliz-)(.*)/);
        if (secretMatches && secretMatches.length >= 3) {
          entryData.secret = secretMatches[2];
          entryData.type = OTPType.battle;
        }
      }

      if (/^stm-/.test(entryData.secret)) {
        const secretMatches = entryData.secret.match(/^stm-(.*)/);
        if (secretMatches && secretMatches.length >= 2) {
          entryData.secret = secretMatches[1];
          entryData.type = OTPType.steam;
        }
      }

      if (
        !/^[a-z2-7]+=*$/i.test(entryData.secret) &&
        /^[0-9a-f]+$/i.test(entryData.secret) &&
        entryData.type === OTPType.totp
      ) {
        entryData.type = OTPType.hex;
      }

      if (
        !/^[a-z2-7]+=*$/i.test(entryData.secret) &&
        /^[0-9a-f]+$/i.test(entryData.secret) &&
        entryData.type === OTPType.hotp
      ) {
        entryData.type = OTPType.hhex;
      }

      const candidateHash = entryData.hash;
      if (
        !/^[a-f0-9]{8}-?[a-f0-9]{4}-?4[a-f0-9]{3}-?[89ab][a-f0-9]{3}-?[a-f0-9]{12}$/.test(
          candidateHash
        )
      ) {
        entryData.hash = crypto.randomUUID();
      }

      while (
        reservedOtpHashes.has(entryData.hash) ||
        Object.prototype.hasOwnProperty.call(payload, entryData.hash)
      ) {
        entryData.hash = crypto.randomUUID();
      }

      const entry = new OTPEntry(entryData, encryption);
      const storageItem = this.getOTPStorageFromEntry(entry);
      payload[entryData.hash] = storageItem;
    }

    return this.ensureUniqueIndex(payload);
  }

  static async import(
    encryption: Encryption,
    data: { [hash: string]: RawOTPStorage }
  ) {
    let currentData = await BrowserStorage.get();
    const existingOtpHashes = new Set(
      Object.keys(currentData).filter(
        (hash) => getOtpOrGroupRecordKind(currentData[hash]) === "otp"
      )
    );
    const payload = this.getImportPayload(encryption, data, existingOtpHashes);
    await BrowserStorage.assertImportPayloadIsSafe(payload);
    currentData = { ...currentData, ...payload };
    currentData = this.ensureUniqueIndex(currentData);
    await BrowserStorage.set(currentData);
    return Object.keys(payload).length;
  }

  static async replaceImport(
    encryption: Encryption,
    data: { [hash: string]: RawOTPStorage },
    groups: { [id: string]: GroupStorageRecord }
  ) {
    const entryPayload = this.getImportPayload(encryption, data);
    if (!Object.keys(entryPayload).length) {
      throw new Error("noImportableEntries");
    }

    const groupPayload = GroupStorage.getImportPayload(groups);
    const conflictingKeys = Object.keys(entryPayload).filter((key) =>
      Object.prototype.hasOwnProperty.call(groupPayload, key)
    );
    if (conflictingKeys.length) {
      throw new Error("importBatchIdConflict");
    }
    await BrowserStorage.replaceOtpAndGroupData({
      ...entryPayload,
      ...groupPayload,
    });

    return {
      importedEntryCount: Object.keys(entryPayload).length,
      importedGroupCount: Object.keys(groupPayload).length,
    };
  }

  static async mergeImport(
    encryption: Encryption,
    data: { [hash: string]: RawOTPStorage },
    groups: { [id: string]: GroupStorageRecord }
  ) {
    const currentData = await BrowserStorage.get();
    const existingOtpHashes = new Set(
      Object.keys(currentData).filter(
        (hash) => getOtpOrGroupRecordKind(currentData[hash]) === "otp"
      )
    );
    const entryPayload = this.getImportPayload(
      encryption,
      data,
      existingOtpHashes
    );
    if (!Object.keys(entryPayload).length) {
      throw new Error("noImportableEntries");
    }

    const currentGroups = await GroupStorage.get();
    const incomingGroups = GroupStorage.getImportGroups(groups);
    const mergedGroups = GroupStorage.mergeImportGroups(
      currentGroups,
      incomingGroups
    );
    const groupPayload = GroupStorage.getPayload(mergedGroups);
    const conflictingKeys = Object.keys(entryPayload).filter((key) =>
      Object.prototype.hasOwnProperty.call(groupPayload, key)
    );
    if (conflictingKeys.length) {
      throw new Error("importBatchIdConflict");
    }

    const normalizedEntries = this.ensureUniqueIndex({
      ...currentData,
      ...entryPayload,
    });
    await BrowserStorage.mergeOtpAndGroupData({
      ...normalizedEntries,
      ...groupPayload,
    });

    return {
      importedEntryCount: Object.keys(entryPayload).length,
      importedGroupCount: incomingGroups.length,
    };
  }

  static async add(entry: OTPEntry) {
    const currentData = await BrowserStorage.get();
    const existingEntries = Object.entries(currentData)
      .filter(
        ([hash, record]) =>
          hash !== entry.hash && getOtpOrGroupRecordKind(record) === "otp"
      )
      .sort(([, a], [, b]) => a.index - b.index);
    const payload: { [hash: string]: OTPStorage } = {};

    entry.index = 0;
    payload[entry.hash] = this.getOTPStorageFromEntry(entry);
    existingEntries.forEach(([hash, record], index) => {
      payload[hash] = { ...record, index: index + 1 };
    });

    await BrowserStorage.commitOtpAndGroupChanges(payload, [], currentData);
  }

  static async update(entry: OTPEntry) {
    const _data = await BrowserStorage.get();
    if (!Object.prototype.hasOwnProperty.call(_data, entry.hash)) {
      throw new Error("Entry to change does not exist.");
    }
    await BrowserStorage.set({
      [entry.hash]: this.getOTPStorageFromEntry(entry),
    });
  }

  static async set(entries: OTPEntry[]) {
    const currentData = await BrowserStorage.get();
    const nextData = { ...currentData };
    entries.forEach((entry) => {
      const storageItem = this.getOTPStorageFromEntry(entry);
      nextData[entry.hash] = storageItem;
    });
    const normalizedEntries = this.ensureUniqueIndex(nextData);
    await BrowserStorage.commitOtpAndGroupChanges(
      normalizedEntries,
      [],
      currentData
    );
  }

  static getStoragePayload(entries: OTPEntry[]) {
    return entries.reduce((records: { [hash: string]: OTPStorage }, entry) => {
      records[entry.hash] = this.getOTPStorageFromEntry(entry);
      return records;
    }, {});
  }

  static async updateMany(entries: OTPEntry[]) {
    const payload = this.getStoragePayload(entries);

    if (Object.keys(payload).length) {
      await BrowserStorage.commitOtpAndGroupChanges(payload);
    }
  }

  static async get() {
    const _data = await BrowserStorage.get();
    const data: OTPEntry[] = [];

    for (const hash of Object.keys(_data)) {
      if (
        hash === "UserSettings" ||
        (_data[hash] as { dataType: string }).dataType === "Key" ||
        getOtpOrGroupRecordKind(_data[hash]) !== "otp" ||
        !this.isValidEntry(_data, hash)
      ) {
        continue;
      }

      const entryData = _data[hash] as RawOTPStorage | EncOTPStorage;

      if (entryData.dataType === "EncOTPStorage") {
        data.push(
          new OTPEntry({
            encrypted: true,
            encData: entryData.data,
            keyId: entryData.keyId,
            hash,
            index: entryData.index,
          })
        );
        continue;
      }

      if (!entryData.hash) {
        entryData.hash = hash;
      }

      if (!entryData.type) {
        entryData.type = OTPType[OTPType.totp];
      }

      let type: OTPType;
      switch (entryData.type) {
        case "totp":
        case "hotp":
        case "battle":
        case "steam":
        case "hex":
        case "hhex":
          type = OTPType[entryData.type];
          break;
        default:
          // we need correct the type here
          // and save it
          type = OTPType.totp;
          entryData.type = OTPType[OTPType.totp];
      }

      let period: number | undefined;
      if (
        (entryData.type === OTPType[OTPType.totp] ||
          entryData.type === OTPType[OTPType.hex]) &&
        entryData.period &&
        entryData.period > 0
      ) {
        period = entryData.period;
      }

      const entry = new OTPEntry({
        account: entryData.account,
        encrypted: entryData.encrypted,
        note: entryData.note,
        groupId: entryData.groupId,
        hash: entryData.hash,
        index: entryData.index,
        issuer: entryData.issuer,
        secret: entryData.secret,
        type,
        counter: entryData.counter,
        period,
        digits: entryData.digits ? Number(entryData.digits) : undefined,
        // @ts-expect-error - it's fine if this ends up undefined
        algorithm: OTPAlgorithm[entryData.algorithm],
        pinned: entryData.pinned,
      });

      data.push(entry);
    }

    data.sort((a, b) => {
      return a.index - b.index;
    });

    return data;
  }

  static async remove(hash: string) {
    await BrowserStorage.remove(hash);
  }

  static async removeMany(hashes: string[]) {
    if (!hashes.length) {
      return;
    }

    const hashSet = new Set(hashes);
    const currentData = await BrowserStorage.get();

    const remainingData = Object.keys(currentData).reduce(
      (records: { [hash: string]: OTPStorage }, hash) => {
        if (!hashSet.has(hash)) {
          records[hash] = currentData[hash];
        }
        return records;
      },
      {}
    );
    const normalizedEntries = this.ensureUniqueIndex(remainingData);
    await BrowserStorage.commitOtpAndGroupChanges(
      normalizedEntries,
      hashes,
      currentData
    );
  }

  static async delete(entry: OTPEntry) {
    const currentData = await BrowserStorage.get();
    const remainingData = { ...currentData };
    if (Object.prototype.hasOwnProperty.call(remainingData, entry.hash)) {
      delete remainingData[entry.hash];
    }
    const normalizedEntries = this.ensureUniqueIndex(remainingData);
    await BrowserStorage.commitOtpAndGroupChanges(
      normalizedEntries,
      [entry.hash],
      currentData
    );
  }
}

export class GroupStorage {
  private static readonly reservedGroupIds = new Set([
    "__all__",
    "__ungrouped__",
  ]);

  private static getStorageRecord(
    group: OTPGroupInterface
  ): GroupStorageRecord {
    return {
      dataType: DataType.Group,
      id: group.id,
      name: group.name.trim(),
      index: group.index,
    };
  }

  static getImportGroups(groups: { [id: string]: GroupStorageRecord }) {
    const importedGroups: OTPGroupInterface[] = [];

    for (const groupId of Object.keys(groups)) {
      const group = groups[groupId];
      if (!isGroupRecord(group) || !group.name.trim()) {
        continue;
      }

      const normalizedId = (group.id || groupId).trim();
      if (
        !normalizedId ||
        this.reservedGroupIds.has(normalizedId) ||
        isUnsafeRecordKey(groupId) ||
        isUnsafeRecordKey(normalizedId) ||
        normalizedId.length > 256 ||
        Array.from(normalizedId).some((character) => {
          const code = character.charCodeAt(0);
          return code <= 31 || code === 127;
        })
      ) {
        throw new Error("invalidImportGroupId");
      }

      importedGroups.push({
        id: normalizedId,
        name: group.name.trim(),
        index: Number(group.index) || 0,
      });
    }

    return normalizeGroups(importedGroups);
  }

  static getImportPayload(groups: { [id: string]: GroupStorageRecord }) {
    return this.getPayload(this.getImportGroups(groups));
  }

  static getPayload(groups: OTPGroupInterface[]) {
    return normalizeGroups(groups).reduce(
      (payload: { [id: string]: GroupStorageRecord }, group) => {
        payload[group.id] = this.getStorageRecord(group);
        return payload;
      },
      createRecordMap<GroupStorageRecord>()
    );
  }

  static mergeImportGroups(
    existingGroups: OTPGroupInterface[],
    incomingGroups: OTPGroupInterface[]
  ) {
    const mergedGroups = normalizeGroups(existingGroups).map((group) => ({
      ...group,
    }));
    const indexById = new Map(
      mergedGroups.map((group, index) => [group.id, index])
    );

    for (const incomingGroup of normalizeGroups(incomingGroups)) {
      const existingIndex = indexById.get(incomingGroup.id);
      if (existingIndex === undefined) {
        indexById.set(incomingGroup.id, mergedGroups.length);
        mergedGroups.push({
          ...incomingGroup,
          index: mergedGroups.length,
        });
      } else {
        mergedGroups[existingIndex] = {
          ...incomingGroup,
          index: mergedGroups[existingIndex].index,
        };
      }
    }

    return normalizeGroups(mergedGroups);
  }

  static async get() {
    const data = await BrowserStorage.get();
    const groups: OTPGroupInterface[] = [];

    for (const recordKey of Object.keys(data)) {
      const record = data[recordKey];
      if (isGroupRecord(record)) {
        groups.push({
          id: record.id,
          name: record.name,
          index: record.index,
        });
      }
    }

    return normalizeGroups(groups);
  }

  static async add(group: OTPGroupInterface) {
    const normalizedGroup = {
      ...group,
      name: group.name.trim(),
    };
    if (!normalizedGroup.id || !normalizedGroup.name) {
      return;
    }
    await BrowserStorage.set({
      [normalizedGroup.id]: this.getStorageRecord(normalizedGroup),
    });
  }

  static async update(group: OTPGroupInterface) {
    const groups = await this.get();
    const index = groups.findIndex((item) => item.id === group.id);
    if (index === -1) {
      throw new Error("Group to change does not exist.");
    }

    const updatedGroup = {
      ...groups[index],
      ...group,
      name: group.name.trim(),
    };
    await BrowserStorage.set({
      [updatedGroup.id]: this.getStorageRecord(updatedGroup),
    });
  }

  static async set(groups: OTPGroupInterface[]) {
    const currentData = await BrowserStorage.get();
    const existingGroupKeys = Object.keys(currentData).filter((key) =>
      isGroupRecord(currentData[key])
    );
    const normalizedGroups = normalizeGroups(groups);
    const nextGroupIds = new Set(normalizedGroups.map((group) => group.id));
    const removedGroupKeys = existingGroupKeys.filter(
      (groupId) => !nextGroupIds.has(groupId)
    );
    const payload = normalizedGroups.reduce(
      (acc: { [id: string]: GroupStorageRecord }, group) => {
        const nextRecord = this.getStorageRecord(group);
        const currentRecord = currentData[group.id];
        if (
          !isGroupRecord(currentRecord) ||
          currentRecord.name !== nextRecord.name ||
          currentRecord.index !== nextRecord.index
        ) {
          acc[group.id] = nextRecord;
        }
        return acc;
      },
      createRecordMap<GroupStorageRecord>()
    );

    await BrowserStorage.commitOtpAndGroupChanges(
      payload,
      removedGroupKeys,
      currentData
    );
  }

  static async delete(groupId: string) {
    const affectedEntries = (await EntryStorage.get()).filter(
      (entry) => entry.groupId === groupId
    );
    for (const entry of affectedEntries) {
      entry.groupId = undefined;
    }

    const remainingGroups = (await this.get()).filter(
      (group) => group.id !== groupId
    );
    const currentData = await BrowserStorage.get();
    await BrowserStorage.commitOtpAndGroupChanges(
      {
        ...this.getPayload(remainingGroups),
        ...EntryStorage.getStoragePayload(affectedEntries),
      },
      [groupId],
      currentData
    );
  }

  static async import(groups: { [id: string]: GroupStorageRecord }) {
    const incomingGroups = this.getImportGroups(groups);
    const incomingPayload = this.getPayload(incomingGroups);
    await BrowserStorage.assertImportPayloadIsSafe(incomingPayload);
    await this.set(this.mergeImportGroups(await this.get(), incomingGroups));
  }
}

export class ManagedStorage {
  static get<T>(key: string): T | undefined;
  static get<T>(key: string, defaultValue: T): T;
  static get<T>(key: string, defaultValue?: T) {
    const managedStoragePromise = new Promise(
      (resolve: (result: T | undefined) => void) => {
        if (chrome.storage.managed) {
          chrome.storage.managed.get((data) => {
            if (chrome.runtime.lastError) {
              return resolve(defaultValue);
            }
            if (data) {
              if (data[key]) {
                return resolve(data[key]);
              }
            }
            return resolve(defaultValue);
          });
        } else {
          // no available in Safari
          resolve(defaultValue);
        }
      }
    );

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(defaultValue), 10);
    });

    return Promise.race([managedStoragePromise, timeoutPromise]);
  }
}
