import "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import {
  assertQrFileBatchSize,
  getOtpUrlFromQrFile,
  getSupportedQrPayload,
  QR_DECODE_TIMEOUT_MS,
} from "../../models/qr-import";

mocha.setup("bdd");

describe("QR import", () => {
  it("rejects QR batches that exceed the configured file count", () => {
    expect(() => assertQrFileBatchSize(2, 1)).to.throw("tooManyQrFiles");
    expect(() => assertQrFileBatchSize(1, 1)).not.to.throw();
  });

  it("accepts only supported OTP QR payloads", () => {
    expect(
      getSupportedQrPayload("  otpauth://totp/Example?secret=ABC  ")
    ).to.equal("otpauth://totp/Example?secret=ABC");
    expect(
      getSupportedQrPayload("otpauth-migration://offline?data=abc")
    ).to.equal("otpauth-migration://offline?data=abc");
    expect(getSupportedQrPayload("https://example.com")).to.equal(null);
  });

  it("rejects when FileReader reports an error", async () => {
    class ErrorFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        this.onerror?.({} as ProgressEvent<FileReader>);
      }

      abort() {
        return;
      }
    }
    sinon.stub(window, "FileReader").value(ErrorFileReader as any);

    const error = await captureError(
      getOtpUrlFromQrFile(new File(["invalid"], "qr.png"))
    );

    expect(error.message).to.equal("readQrFailed");
  });

  it("times out when QR decoding never completes", async () => {
    const clock = sinon.useFakeTimers();
    class HangingFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;

      readAsDataURL() {
        return;
      }

      abort() {
        return;
      }
    }
    sinon.stub(window, "FileReader").value(HangingFileReader as any);

    const pendingResult = captureError(
      getOtpUrlFromQrFile(new File(["pending"], "qr.png"))
    );
    await clock.tickAsync(QR_DECODE_TIMEOUT_MS);
    const error = await pendingResult;

    expect(error.message).to.equal("qrDecodeTimeout");
  });
});

async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected promise to reject");
}
