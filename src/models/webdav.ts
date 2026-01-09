import { Encryption } from "./encryption";
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

const DEFAULT_TIMEOUT = 15000;

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
  timeout = DEFAULT_TIMEOUT
): Promise<WebDAVResponse> {
  if (!hasSessionFetchSupport()) {
    throw new Error("Fetch is not available.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const responseText = await response.text();
    const headerLines: string[] = [];
    response.headers.forEach((value, key) => {
      headerLines.push(`${key}: ${value}`);
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: headerLines.join("\r\n"),
      responseText,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendWebDAVRequest(
  method: string,
  url: string,
  username: string,
  password: string,
  body?: string,
  additionalHeaders?: Record<string, string>
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
    timeout: DEFAULT_TIMEOUT,
  };

  try {
    const response = await runtimeSendMessage<WebDAVResponse>(message);
    return response;
  } catch (error) {
    return await directFetch(method, url, headers, body, DEFAULT_TIMEOUT);
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
  encryptedBackup: boolean
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
    try {
      const response = await sendWebDAVRequest(
        "PUT",
        uploadUrl,
        config.username,
        config.password,
        backup,
        {
          "Content-Type": "application/json",
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
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      console.error(
        `[WebDAV] Upload failed with status ${response.status}: ${response.statusText}`
      );
      return false;
    } catch (error) {
      if (attempt < maxRetries) {
        console.log(
          `[WebDAV] Upload error, retrying (${attempt}/${maxRetries})...`,
          error
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      throw error;
    }
  }

  return false;
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

  return files.sort((a, b) => {
    if (a.lastModified && b.lastModified) {
      return (
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );
    }
    return b.name.localeCompare(a.name);
  });
}

export async function downloadWebDAVBackup(fileName: string): Promise<string> {
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
    config.password
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
