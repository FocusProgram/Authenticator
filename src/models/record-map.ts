const UNSAFE_RECORD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function createRecordMap<T>(source?: Record<string, T>) {
  const records = Object.create(null) as Record<string, T>;
  if (source) {
    for (const key of Object.keys(source)) {
      records[key] = source[key];
    }
  }
  return records;
}

export function isUnsafeRecordKey(key: string) {
  return UNSAFE_RECORD_KEYS.has(key);
}
