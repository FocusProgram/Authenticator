import { BrowserStorage, isOldKey } from "./storage";

const ARGON_TIMEOUT_MS = 20000;
let argonRequestCounter = 0;

type ArgonRequest =
  | { action: "hash"; value: string; salt: string }
  | { action: "verify"; value: string; hash: string };

function requestArgon<T>(request: ArgonRequest): Promise<T> {
  const iframe = document.getElementById(
    "argon-sandbox"
  ) as HTMLIFrameElement | null;
  const targetWindow = iframe?.contentWindow;

  if (!targetWindow) {
    throw new Error("argon-sandbox missing!");
  }

  const requestId = `argon-${Date.now()}-${++argonRequestCounter}`;

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(timeoutId);
    };
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source !== targetWindow ||
        !event.data ||
        event.data.requestId !== requestId ||
        (!("response" in event.data) && !("error" in event.data))
      ) {
        return;
      }

      cleanup();
      if (event.data.error) {
        reject(new Error(String(event.data.error)));
        return;
      }
      resolve(event.data.response as T);
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("argon2 request timed out"));
    }, ARGON_TIMEOUT_MS);

    window.addEventListener("message", handleMessage);
    try {
      targetWindow.postMessage({ ...request, requestId }, "*");
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function argonHash(
  value: string,
  salt: string
): Promise<string | undefined> {
  return requestArgon<string | undefined>({
    action: "hash",
    value,
    salt,
  });
}

export async function argonVerify(
  value: string,
  hash: string
): Promise<boolean> {
  return requestArgon<boolean>({
    action: "verify",
    value,
    hash,
  });
}

// Verify a password using keys in BrowserStorage
export async function verifyPasswordUsingKeyID(
  keyId: string,
  password: string
): Promise<boolean> {
  // Get key for current encryption
  const keys = await BrowserStorage.getKeys();
  if (isOldKey(keys)) {
    throw new Error(
      "v3 encryption not being used with verifyPassword. This should never happen!"
    );
  }

  const key = keys.find((key) => key.id === keyId);
  if (!key) {
    throw new Error(`Key ${keyId} not in BrowserStorage`);
  }

  return verifyPasswordUsingKey(key, password);
}

export async function verifyPasswordUsingKey(
  key: Key,
  password: string
): Promise<boolean> {
  // Hash password with argon
  const rawHash = await argonHash(password, key.salt);
  if (!rawHash) {
    throw new Error("argon2 did not return a hash!");
  }
  // https://passlib.readthedocs.io/en/stable/lib/passlib.hash.argon2.html#format-algorithm
  const possibleHash = rawHash.split("$")[5];
  if (!possibleHash) {
    throw new Error("argon2 did not return a hash!");
  }

  // verify user password by comparing their password hash with the
  // hash of their password's hash
  return await argonVerify(possibleHash, key.hash);
}
