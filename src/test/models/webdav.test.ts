import "mocha";
import { expect } from "chai";
import {
  getWebDAVBackupsToPrune,
  isWebDAVBackupDue,
  readWebDAVResponseText,
} from "../../models/webdav";

mocha.setup("bdd");

describe("WebDAV transfer limits", () => {
  it("runs the automatic backup on a seven-day interval or clock rollback", () => {
    expect(isWebDAVBackupDue(100, 93)).to.equal(true);
    expect(isWebDAVBackupDue(100, 94)).to.equal(false);
    expect(isWebDAVBackupDue(100, 101)).to.equal(true);
  });

  it("selects only the oldest WebDAV files beyond the retention limit", () => {
    const files = [
      {
        name: "old.json",
        displayName: "old.json",
        lastModified: "2026-01-01T00:00:00.000Z",
      },
      {
        name: "new.json",
        displayName: "new.json",
        lastModified: "2026-03-01T00:00:00.000Z",
      },
      {
        name: "middle.json",
        displayName: "middle.json",
        lastModified: "2026-02-01T00:00:00.000Z",
      },
    ];

    expect(getWebDAVBackupsToPrune(files, 2).map((file) => file.name)).to.eql([
      "old.json",
    ]);
  });

  it("rejects a response whose declared size exceeds the limit", async () => {
    const response = new Response("12345", {
      headers: { "content-length": "5" },
    });
    const error = await captureError(
      readWebDAVResponseText(response, { maxBytes: 4 })
    );

    expect(error.message).to.equal("backupContentTooLarge");
  });

  it("reports streamed download progress", async () => {
    const progress: number[] = [];
    const response = new Response("12345");

    const result = await readWebDAVResponseText(response, {
      maxBytes: 10,
      onProgress: (loaded) => progress.push(loaded),
    });

    expect(result).to.equal("12345");
    expect(progress[progress.length - 1]).to.equal(5);
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
