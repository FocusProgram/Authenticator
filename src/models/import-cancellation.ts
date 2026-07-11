export function throwIfImportCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("importCancelled");
  }
}
