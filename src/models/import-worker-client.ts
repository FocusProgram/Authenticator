import { parseBackupContent, ParsedBackup } from "./import-service";

export const BACKUP_PARSE_WORKER_THRESHOLD_BYTES = 512 * 1024;
const BACKUP_PARSE_WORKER_TIMEOUT_MS = 5 * 60 * 1000;

type ParseBackupWorkerOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export function shouldParseBackupInWorker(content: string) {
  return new Blob([content]).size >= BACKUP_PARSE_WORKER_THRESHOLD_BYTES;
}

export async function parseBackupContentOffThread(
  content: string,
  options: ParseBackupWorkerOptions = {}
): Promise<ParsedBackup> {
  return parseBackupDataOffThread(content, options);
}

export async function parseBackupBufferOffThread(
  contentBuffer: ArrayBuffer,
  options: ParseBackupWorkerOptions = {}
): Promise<ParsedBackup> {
  return parseBackupDataOffThread(contentBuffer, options);
}

async function parseBackupDataOffThread(
  input: string | ArrayBuffer,
  options: ParseBackupWorkerOptions
): Promise<ParsedBackup> {
  if (options.signal?.aborted) {
    throw new Error("importCancelled");
  }

  const inputSize =
    typeof input === "string" ? new Blob([input]).size : input.byteLength;
  if (
    inputSize < BACKUP_PARSE_WORKER_THRESHOLD_BYTES ||
    typeof Worker === "undefined" ||
    typeof chrome?.runtime?.getURL !== "function"
  ) {
    options.onProgress?.(50);
    const content =
      typeof input === "string" ? input : new TextDecoder().decode(input);
    const result = await parseBackupContent(content);
    if (options.signal?.aborted) {
      throw new Error("importCancelled");
    }
    options.onProgress?.(100);
    return result;
  }

  const worker = new Worker(chrome.runtime.getURL("dist/importWorker.js"));
  const requestId = `backup-parse-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  return new Promise<ParsedBackup>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
    };
    const rejectAndCleanup = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleAbort = () => rejectAndCleanup(new Error("importCancelled"));
    const timeoutId = window.setTimeout(() => {
      rejectAndCleanup(new Error("backupParseTimeout"));
    }, BACKUP_PARSE_WORKER_TIMEOUT_MS);

    options.signal?.addEventListener("abort", handleAbort, { once: true });
    worker.onerror = (event) => {
      rejectAndCleanup(new Error(event.message || "backupWorkerFailed"));
    };
    worker.onmessage = (
      event: MessageEvent<{
        requestId?: string;
        progress?: number;
        result?: ParsedBackup;
        error?: string;
      }>
    ) => {
      if (event.data?.requestId !== requestId || settled) {
        return;
      }
      if (typeof event.data.progress === "number") {
        options.onProgress?.(event.data.progress);
        return;
      }
      if (event.data.error) {
        rejectAndCleanup(new Error(event.data.error));
        return;
      }
      if (!event.data.result) {
        rejectAndCleanup(new Error("backupWorkerFailed"));
        return;
      }
      const result = event.data.result;
      cleanup();
      resolve(result);
    };

    const message = {
      action: "parseBackup",
      requestId,
      ...(typeof input === "string"
        ? { content: input }
        : { contentBuffer: input }),
    };
    if (input instanceof ArrayBuffer) {
      worker.postMessage(message, [input]);
    } else {
      worker.postMessage(message);
    }
  });
}
