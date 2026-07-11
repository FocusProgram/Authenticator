// @ts-expect-error qrcode-reader does not ship TypeScript declarations.
import QRCode from "qrcode-reader";
import jsQR from "jsqr";
import { throwIfImportCancelled } from "./import-cancellation";

const MAX_QR_DIMENSION = 2048;
export const QR_DECODE_TIMEOUT_MS = 12000;
export const MAX_QR_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_QR_FILE_COUNT = 100;

export function assertQrFileBatchSize(
  fileCount: number,
  maxFileCount = MAX_QR_FILE_COUNT
) {
  if (fileCount > maxFileCount) {
    throw new Error("tooManyQrFiles");
  }
}

export async function getOtpUrlFromQrFile(
  file: File,
  signal?: AbortSignal
): Promise<string | null> {
  throwIfImportCancelled(signal);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      resolve(value);
    };
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      reject(error);
    };
    const timeoutId = window.setTimeout(() => {
      fail(new Error("qrDecodeTimeout"));
      try {
        reader.abort();
      } catch {
        // Ignore an already completed FileReader.
      }
    }, QR_DECODE_TIMEOUT_MS);
    const handleAbort = () => {
      try {
        reader.abort();
      } catch {
        // Ignore an already completed FileReader.
      }
      fail(new Error("importCancelled"));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });

    reader.onerror = () => fail(new Error("readQrFailed"));
    reader.onabort = () => fail(new Error("readQrAborted"));
    reader.onload = () => {
      const imageUrl = reader.result as string;
      const qrReader = new QRCode();
      qrReader.callback = (
        error: string,
        text: {
          result: string;
          points: Array<{
            x: number;
            y: number;
            count: number;
            estimatedModuleSize: number;
          }>;
        }
      ) => {
        if (error) {
          decodeWithJsQr(imageUrl).then(finish).catch(fail);
        } else {
          finish(getSupportedQrPayload(text.result));
        }
      };
      try {
        qrReader.decode(imageUrl);
      } catch {
        decodeWithJsQr(imageUrl).then(finish).catch(fail);
      }
    };
    reader.readAsDataURL(file);
  });
}

function decodeWithJsQr(imageUrl: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    image.onerror = () => reject(new Error("loadQrFailed"));
    image.onload = () => {
      try {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) {
          resolve(null);
          return;
        }

        const scale = Math.min(
          1,
          MAX_QR_DIMENSION / Math.max(sourceWidth, sourceHeight)
        );
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const result = jsQR(imageData.data, width, height);
        resolve(getSupportedQrPayload(result?.data || ""));
      } catch (error) {
        reject(error);
      }
    };
    image.src = imageUrl;
  });
}

export function getSupportedQrPayload(value: string): string | null {
  const normalizedValue = value.trim();
  return /^(otpauth|otpauth-migration):\/\//i.test(normalizedValue)
    ? normalizedValue
    : null;
}
