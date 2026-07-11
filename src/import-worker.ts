import { parseBackupContent } from "./models/import-service";

type ParseWorkerRequest = {
  action: "parseBackup";
  content?: string;
  contentBuffer?: ArrayBuffer;
  requestId: string;
};

// The project uses DOM typings globally, so WorkerGlobalScope is accessed
// through a narrow structural type instead of adding conflicting lib entries.
const workerScope = (self as unknown) as {
  onmessage: ((event: MessageEvent<ParseWorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
};

workerScope.onmessage = async (event) => {
  const request = event.data;
  if (!request || request.action !== "parseBackup" || !request.requestId) {
    return;
  }

  try {
    workerScope.postMessage({
      requestId: request.requestId,
      progress: 20,
    });
    const content = request.contentBuffer
      ? new TextDecoder().decode(request.contentBuffer)
      : request.content || "";
    const result = await parseBackupContent(content);
    workerScope.postMessage({
      requestId: request.requestId,
      progress: 90,
    });
    workerScope.postMessage({ requestId: request.requestId, result });
  } catch (error) {
    workerScope.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
