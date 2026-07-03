import { Encryption } from "./encryption";
import { OTPEntry, OTPType, OTPAlgorithm, CodeState } from "./otp";
import { StorageLocation, UserSettings } from "./settings";
import { DataType } from "./otp";
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
    const exportData: {
      [hash: string]: OTPStorage | Key | OldKey | GroupStorageRecord;
    } = {};

    for (const hash of Object.keys(rawData)) {
      const storageItem = rawData[hash];

      if (isGroupRecord(storageItem)) {
        exportData[hash] = { ...storageItem };
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

  static async import(
    encryption: Encryption,
    data: { [hash: string]: RawOTPStorage }
  ) {
    let _data = await BrowserStorage.get();
    for (const hash of Object.keys(data)) {
      // never trust data import from user
      // data must be decrypted before calling this method
      if (!data[hash].secret || data[hash].encrypted) {
        // TODO: we need give a failed warning
        continue;
      }

      const rawAlgorithm = data[hash].algorithm;
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
        type: (parseInt(data[hash].type) as OTPType) || OTPType[OTPType.totp],
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
        algorithm: rawAlgorithm
          ? (parseInt(rawAlgorithm) as OTPAlgorithm)
          : OTPAlgorithm.SHA1,
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

      // not a valid / old hash
      if (
        !/^[a-f0-9]{8}-?[a-f0-9]{4}-?4[a-f0-9]{3}-?[89ab][a-f0-9]{3}-?[a-f0-9]{12}$/.test(
          hash
        )
      ) {
        entryData.hash = crypto.randomUUID();
        delete data[hash];
      }

      const entry = new OTPEntry(entryData, encryption);
      const storageItem = this.getOTPStorageFromEntry(entry);
      _data[entryData.hash] = storageItem;
    }
    _data = this.ensureUniqueIndex(_data);
    await BrowserStorage.set(_data);
  }

  static async add(entry: OTPEntry) {
    await BrowserStorage.set({
      [entry.hash]: this.getOTPStorageFromEntry(entry),
    });
  }

  static async update(entry: OTPEntry) {
    let _data = await BrowserStorage.get();
    if (!Object.prototype.hasOwnProperty.call(_data, entry.hash)) {
      throw new Error("Entry to change does not exist.");
    }
    const storageItem = this.getOTPStorageFromEntry(entry);
    _data[entry.hash] = storageItem;
    _data = this.ensureUniqueIndex(_data);
    await BrowserStorage.set(_data);
  }

  static async set(entries: OTPEntry[]) {
    let _data = await BrowserStorage.get();
    entries.forEach((entry) => {
      const storageItem = this.getOTPStorageFromEntry(entry);
      _data[entry.hash] = storageItem;
    });
    _data = this.ensureUniqueIndex(_data);
    await BrowserStorage.set(_data);
  }

  static async get() {
    const _data = await BrowserStorage.get();
    const data: OTPEntry[] = [];

    for (const hash of Object.keys(_data)) {
      if (
        hash === "UserSettings" ||
        (_data[hash] as { dataType: string }).dataType === "Key" ||
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
        entryData.type === OTPType[OTPType.totp] &&
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

  static async delete(entry: OTPEntry) {
    let _data = await BrowserStorage.get();
    if (Object.prototype.hasOwnProperty.call(_data, entry.hash)) {
      delete _data[entry.hash];
    }
    _data = this.ensureUniqueIndex(_data);
    await BrowserStorage.remove(entry.hash);
    await BrowserStorage.set(_data);
  }
}

export class GroupStorage {
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
    const groups = await this.get();
    groups.push(group);
    await this.set(groups);
  }

  static async update(group: OTPGroupInterface) {
    const groups = await this.get();
    const index = groups.findIndex((item) => item.id === group.id);
    if (index === -1) {
      throw new Error("Group to change does not exist.");
    }

    groups[index] = {
      ...groups[index],
      ...group,
      name: group.name.trim(),
    };
    await this.set(groups);
  }

  static async set(groups: OTPGroupInterface[]) {
    const currentData = await BrowserStorage.get();
    const existingGroupKeys = Object.keys(currentData).filter((key) =>
      isGroupRecord(currentData[key])
    );

    if (existingGroupKeys.length) {
      await BrowserStorage.remove(existingGroupKeys);
    }

    const normalizedGroups = normalizeGroups(groups);
    const payload = normalizedGroups.reduce(
      (acc: { [id: string]: GroupStorageRecord }, group) => {
        acc[group.id] = this.getStorageRecord(group);
        return acc;
      },
      {}
    );

    if (Object.keys(payload).length) {
      await BrowserStorage.set(payload);
    }
  }

  static async delete(groupId: string) {
    await BrowserStorage.remove(groupId);

    const entries = await EntryStorage.get();
    let changed = false;
    for (const entry of entries) {
      if (entry.groupId === groupId) {
        entry.groupId = undefined;
        changed = true;
      }
    }

    if (changed) {
      await EntryStorage.set(entries);
    }

    const groups = await this.get();
    if (groups.length) {
      await this.set(groups);
    }
  }

  static async import(groups: { [id: string]: GroupStorageRecord }) {
    const importedGroups: OTPGroupInterface[] = await this.get();
    const existingIds = new Set(importedGroups.map((group) => group.id));

    for (const groupId of Object.keys(groups)) {
      const group = groups[groupId];
      if (!isGroupRecord(group)) {
        continue;
      }

      const normalizedGroup = {
        id: group.id || groupId,
        name: group.name.trim(),
        index: Number(group.index) || 0,
      };

      if (existingIds.has(normalizedGroup.id)) {
        const index = importedGroups.findIndex(
          (item) => item.id === normalizedGroup.id
        );
        importedGroups[index] = normalizedGroup;
      } else {
        importedGroups.push(normalizedGroup);
        existingIds.add(normalizedGroup.id);
      }
    }

    await this.set(importedGroups);
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
