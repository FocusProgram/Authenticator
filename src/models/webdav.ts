import { Encryption } from "./encryption";
import { MAX_BACKUP_CONTENT_BYTES } from "./import-limits";
import { EntryStorage } from "./storage";
import { UserSettings } from "./settings";

export type WebDAVConfig = {
  url: string;
  username: string;
  password: string;
  encrypted: boolean;
};

export type WebDAVFile = {
  name: string;
  displayName: string;
  size?: number;
  lastModified?: string;
};

type WebDAVResponse = {
  status: number;
  statusText: string;
  headers: string;
  responseText: string;
};

export type WebDAVTransferOptions = {
  signal?: AbortSignal;
  onDownloadProgress?: (loadedBytes: number, totalBytes?: number) => void;
};

type WebDAVRequestOptions = WebDAVTransferOptions & {
  maxResponseBytes?: number;
  preferDirect?: boolean;
  timeout?: number;
};

export const WEBDAV_CONTROL_TIMEOUT_MS = 15000;
export const WEBDAV_TRANSFER_TIMEOUT_MS = 5 * 60 * 1000;

export function isWebDAVBackupDue(
  currentDay: number,
  lastBackupDay: number,
  intervalDays = 7
) {
  const delta = currentDay - lastBackupDay;
  return delta < 0 || delta >= intervalDays;
}

function getBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export function getWebDAVOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch (error) {
    console.error(error);
    return "";
  }
}

function hasSessionFetchSupport() {
  return typeof fetch === "function";
}

async function runtimeSendMessage<T>(message: unknown): Promise<T> {
  if (typeof chrome.runtime.sendMessage !== "function") {
    return Promise.reject(
      new Error("Runtime messaging is not available in this context.")
    );
  }

  return new Promise<T>((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Silently reject - caller will handle by using directFetch
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response as T);
      });
    } catch (error) {
      reject(error as Error);
    }
  });
}

async function directFetch(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
  options: WebDAVRequestOptions = {}
): Promise<WebDAVResponse> {
  if (!hasSessionFetchSupport()) {
    throw new Error("Fetch is not available.");
  }

  const controller = new AbortController();
  const timeout = options.timeout || WEBDAV_CONTROL_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const responseText = await readWebDAVResponseText(response, {
      maxBytes: options.maxResponseBytes,
      onProgress: options.onDownloadProgress,
      signal: controller.signal,
    });
    const headerLines: string[] = [];
    response.headers.forEach((value, key) => {
      headerLines.push(`${key}: ${value}`);
    });

    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: headerLines.join("\r\n"),
      responseText,
    };
    return result;
  } catch (error) {
    if (options.signal?.aborted) {
      throw new Error("cancelled");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("webdavTimeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function readWebDAVResponseText(
  response: Response,
  options: {
    maxBytes?: number;
    onProgress?: (loadedBytes: number, totalBytes?: number) => void;
    signal?: AbortSignal;
  } = {}
) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (options.maxBytes && contentLength > options.maxBytes) {
    throw new Error("backupContentTooLarge");
  }

  if (!response.body) {
    const responseText = await response.text();
    const responseBytes = new Blob([responseText]).size;
    if (options.maxBytes && responseBytes > options.maxBytes) {
      throw new Error("backupContentTooLarge");
    }
    options.onProgress?.(responseBytes, contentLength || responseBytes);
    return responseText;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let loadedBytes = 0;
  let readComplete = false;

  try {
    while (!readComplete) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const result = await reader.read();
      if (result.done) {
        readComplete = true;
        continue;
      }
      if (!result.value) {
        continue;
      }
      loadedBytes += result.value.byteLength;
      if (options.maxBytes && loadedBytes > options.maxBytes) {
        await reader.cancel();
        throw new Error("backupContentTooLarge");
      }
      chunks.push(decoder.decode(result.value, { stream: true }));
      options.onProgress?.(
        loadedBytes,
        contentLength > 0 ? contentLength : undefined
      );
    }
    chunks.push(decoder.decode());
    options.onProgress?.(
      loadedBytes,
      contentLength > 0 ? contentLength : loadedBytes
    );
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

async function sendWebDAVRequest(
  method: string,
  url: string,
  username: string,
  password: string,
  body?: string,
  additionalHeaders?: Record<string, string>,
  options: WebDAVRequestOptions = {}
): Promise<WebDAVResponse> {
  const credentials = btoa(`${username}:${password}`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${credentials}`,
    ...additionalHeaders,
  };

  const message = {
    action: "webdavRequest",
    method,
    url,
    headers,
    body,
    timeout: options.timeout || WEBDAV_CONTROL_TIMEOUT_MS,
  };

  if (options.preferDirect) {
    return directFetch(method, url, headers, body, options);
  }

  try {
    const response = await runtimeSendMessage<WebDAVResponse>(message);
    return response;
  } catch (error) {
    return await directFetch(method, url, headers, body, options);
  }
}

export async function getWebDAVConfig(): Promise<WebDAVConfig> {
  await UserSettings.updateItems();
  return {
    url: UserSettings.items.webdavUrl || "",
    username: UserSettings.items.webdavUsername || "",
    password: UserSettings.items.webdavPassword || "",
    encrypted:
      UserSettings.items.webdavEncrypted === undefined
        ? true
        : UserSettings.items.webdavEncrypted === true,
  };
}

export async function saveWebDAVConfig(config: WebDAVConfig) {
  UserSettings.items.webdavUrl = config.url;
  UserSettings.items.webdavUsername = config.username;
  UserSettings.items.webdavPassword = config.password;
  UserSettings.items.webdavEncrypted = config.encrypted;
  await UserSettings.commitItems();
}

export async function clearWebDAVConfig() {
  delete UserSettings.items.webdavUrl;
  delete UserSettings.items.webdavUsername;
  delete UserSettings.items.webdavPassword;
  delete UserSettings.items.webdavEncrypted;
  await UserSettings.commitItems();
}

export async function testWebDAVConnection(): Promise<boolean> {
  const config = await getWebDAVConfig();
  if (!config.url || !config.username || !config.password) {
    throw new Error("Missing WebDAV configuration.");
  }
  const url = getBaseUrl(config.url);

  const response = await sendWebDAVRequest(
    "OPTIONS",
    url,
    config.username,
    config.password
  );

  if (response.status >= 200 && response.status < 300) {
    return true;
  }

  if (response.status === 405 || response.status === 403) {
    const propfindResponse = await sendWebDAVRequest(
      "PROPFIND",
      url,
      config.username,
      config.password,
      `<?xml version="1.0" encoding="UTF-8" ?>
      <d:propfind xmlns:d="DAV:">
        <d:prop>
          <d:displayname />
        </d:prop>
      </d:propfind>`,
      {
        Depth: "0",
        "Content-Type": "text/xml",
      }
    );
    return propfindResponse.status === 207 || propfindResponse.status === 200;
  }

  return false;
}

export async function uploadWebDAVBackup(
  encryption: Encryption,
  encryptedBackup: boolean,
  options: WebDAVTransferOptions = {}
): Promise<boolean> {
  const config = await getWebDAVConfig();
  if (!config.url || !config.username || !config.password) {
    throw new Error("Missing WebDAV configuration.");
  }

  const exportData = await EntryStorage.backupGetExport(
    encryption,
    encryptedBackup
  );
  const backup = JSON.stringify(exportData, null, 2);
  if (new Blob([backup]).size > MAX_BACKUP_CONTENT_BYTES) {
    throw new Error("backupContentTooLarge");
  }
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  // Add milliseconds to make filename more unique and avoid 423 conflicts
  const ms = now.getMilliseconds().toString().padStart(3, "0");
  const backupType = encryptedBackup ? "encrypted" : "plain";
  const fileName = `authenticator-${backupType}-${timestamp}-${ms}.json`;
  const baseUrl = getBaseUrl(config.url);
  const uploadUrl = `${baseUrl}/${fileName}`;

  // Retry logic for handling 423 (Locked) status
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw new Error("cancelled");
    }
    try {
      const response = await sendWebDAVRequest(
        "PUT",
        uploadUrl,
        config.username,
        config.password,
        backup,
        {
          "Content-Type": "application/json",
        },
        {
          preferDirect: true,
          signal: options.signal,
          timeout: WEBDAV_TRANSFER_TIMEOUT_MS,
        }
      );

      if (
        response.status === 200 ||
        response.status === 201 ||
        response.status === 204
      ) {
        return true;
      }

      // Handle 423 Locked error with retry
      if (response.status === 423 && attempt < maxRetries) {
        console.log(
          `[WebDAV] Upload locked (423), retrying (${attempt}/${maxRetries})...`
        );
        // Wait before retry (exponential backoff)
        await waitForWebDAVRetry(1000 * attempt, options.signal);
        continue;
      }

      console.error(
        `[WebDAV] Upload failed with status ${response.status}: ${response.statusText}`
      );
      return false;
    } catch (error) {
      if (
        options.signal?.aborted ||
        (error instanceof Error && error.message === "cancelled")
      ) {
        throw new Error("cancelled");
      }
      if (attempt < maxRetries) {
        console.log(
          `[WebDAV] Upload error, retrying (${attempt}/${maxRetries})...`,
          error
        );
        await waitForWebDAVRetry(1000 * attempt, options.signal);
        continue;
      }
      throw error;
    }
  }

  return false;
}

function waitForWebDAVRetry(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("cancelled"));
      return;
    }
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("cancelled"));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function listWebDAVBackups(): Promise<WebDAVFile[]> {
  const config = await getWebDAVConfig();
  if (!config.url || !config.username || !config.password) {
    throw new Error("Missing WebDAV configuration.");
  }

  const baseUrl = getBaseUrl(config.url);

  const response = await sendWebDAVRequest(
    "PROPFIND",
    baseUrl + "/",
    config.username,
    config.password,
    `<?xml version="1.0" encoding="utf-8" ?>
    <d:propfind xmlns:d="DAV:">
      <d:prop>
        <d:displayname />
        <d:getlastmodified />
        <d:getcontentlength />
      </d:prop>
    </d:propfind>`,
    {
      Depth: "1",
      "Content-Type": "text/xml",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    }
  );

  if (response.status !== 207 && response.status !== 200) {
    throw new Error(response.statusText || "Failed to fetch file list.");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(response.responseText, "text/xml");
  const nodes = Array.from(doc.getElementsByTagNameNS("*", "response"));
  const basePath = new URL(baseUrl).pathname.replace(/\/$/, "") || "/";

  const files: WebDAVFile[] = [];
  nodes.forEach((node) => {
    const hrefNode = node.getElementsByTagNameNS("*", "href")[0];
    if (!hrefNode || !hrefNode.textContent) {
      return;
    }
    const href = decodeURIComponent(hrefNode.textContent);
    let filePath = href;
    if (filePath.startsWith(basePath)) {
      filePath = filePath.substring(basePath.length);
    }
    filePath = filePath.replace(/^\/+/, "");

    if (!filePath || filePath.endsWith("/")) {
      return;
    }

    const propNode = node.getElementsByTagNameNS("*", "prop")[0];
    const displayNameNode = propNode?.getElementsByTagNameNS(
      "*",
      "displayname"
    )[0];
    const sizeNode = propNode?.getElementsByTagNameNS(
      "*",
      "getcontentlength"
    )[0];
    const modifiedNode = propNode?.getElementsByTagNameNS(
      "*",
      "getlastmodified"
    )[0];

    files.push({
      name: filePath,
      displayName: displayNameNode?.textContent || filePath,
      size: sizeNode ? Number(sizeNode.textContent) : undefined,
      lastModified: modifiedNode?.textContent || undefined,
    });
  });

  return files.sort(compareWebDAVFilesNewestFirst);
}

export async function downloadWebDAVBackup(
  fileName: string,
  options: WebDAVTransferOptions = {}
): Promise<string> {
  const config = await getWebDAVConfig();
  if (!config.url || !config.username || !config.password) {
    throw new Error("Missing WebDAV configuration.");
  }

  const baseUrl = getBaseUrl(config.url);
  const fileUrl = `${baseUrl}/${fileName}`;
  const response = await sendWebDAVRequest(
    "GET",
    fileUrl,
    config.username,
    config.password,
    undefined,
    undefined,
    {
      maxResponseBytes: MAX_BACKUP_CONTENT_BYTES,
      onDownloadProgress: options.onDownloadProgress,
      preferDirect: true,
      signal: options.signal,
      timeout: WEBDAV_TRANSFER_TIMEOUT_MS,
    }
  );

  if (response.status >= 200 && response.status < 300) {
    return response.responseText;
  }

  throw new Error(response.statusText || "Failed to download backup.");
}

export async function deleteWebDAVBackup(fileName: string): Promise<boolean> {
  const config = await getWebDAVConfig();
  if (!config.url || !config.username || !config.password) {
    throw new Error("Missing WebDAV configuration.");
  }

  const baseUrl = getBaseUrl(config.url);
  const fileUrl = `${baseUrl}/${fileName}`;
  const response = await sendWebDAVRequest(
    "DELETE",
    fileUrl,
    config.username,
    config.password
  );

  return (
    response.status === 200 ||
    response.status === 204 ||
    response.status === 404
  );
}

export function getWebDAVBackupsToPrune(
  files: WebDAVFile[],
  maxBackups: number
) {
  const normalizedLimit = Math.max(0, Math.floor(Number(maxBackups) || 0));
  if (!normalizedLimit || files.length <= normalizedLimit) {
    return [];
  }
  return [...files].sort(compareWebDAVFilesNewestFirst).slice(normalizedLimit);
}

export async function pruneWebDAVBackups(
  maxBackups: number,
  knownFiles?: WebDAVFile[]
) {
  const normalizedLimit = Math.max(0, Math.floor(Number(maxBackups) || 0));
  if (!normalizedLimit) {
    return 0;
  }

  let files: WebDAVFile[];
  try {
    files = knownFiles || (await listWebDAVBackups());
  } catch (error) {
    console.error("Failed to list WebDAV backups for retention cleanup", error);
    return 0;
  }
  const filesToDelete = getWebDAVBackupsToPrune(files, normalizedLimit);
  let deletedCount = 0;

  for (const file of filesToDelete) {
    try {
      if (await deleteWebDAVBackup(file.name)) {
        deletedCount++;
      }
    } catch (error) {
      console.error("Failed to delete old WebDAV backup:", file.name, error);
    }
  }

  return deletedCount;
}

function compareWebDAVFilesNewestFirst(a: WebDAVFile, b: WebDAVFile) {
  if (a.lastModified && b.lastModified) {
    const timestampDelta =
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    if (Number.isFinite(timestampDelta) && timestampDelta !== 0) {
      return timestampDelta;
    }
  }
  return b.name.localeCompare(a.name);
}
