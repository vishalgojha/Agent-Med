import type { IncomingMessage } from "node:http";

export const DEFAULT_WEBHOOK_MAX_BODY_BYTES = 64 * 1024;
export const DEFAULT_WEBHOOK_BODY_TIMEOUT_MS = 10_000;

export type RequestBodyLimitErrorCode =
  | "PAYLOAD_TOO_LARGE"
  | "REQUEST_BODY_TIMEOUT"
  | "CONNECTION_CLOSED";

type RequestBodyLimitErrorInit = {
  code: RequestBodyLimitErrorCode;
  message?: string;
};

const DEFAULT_ERROR_MESSAGE: Record<RequestBodyLimitErrorCode, string> = {
  PAYLOAD_TOO_LARGE: "PayloadTooLarge",
  REQUEST_BODY_TIMEOUT: "RequestBodyTimeout",
  CONNECTION_CLOSED: "RequestBodyConnectionClosed"
};

const DEFAULT_RESPONSE_MESSAGE: Record<RequestBodyLimitErrorCode, string> = {
  PAYLOAD_TOO_LARGE: "Payload too large",
  REQUEST_BODY_TIMEOUT: "Request body timeout",
  CONNECTION_CLOSED: "Connection closed"
};

export class RequestBodyLimitError extends Error {
  readonly code: RequestBodyLimitErrorCode;

  constructor(init: RequestBodyLimitErrorInit) {
    super(init.message ?? DEFAULT_ERROR_MESSAGE[init.code]);
    this.name = "RequestBodyLimitError";
    this.code = init.code;
  }
}

export function isRequestBodyLimitError(
  error: unknown,
  code?: RequestBodyLimitErrorCode
): error is RequestBodyLimitError {
  if (!(error instanceof RequestBodyLimitError)) {
    return false;
  }
  return code ? error.code === code : true;
}

export function requestBodyErrorToText(code: RequestBodyLimitErrorCode): string {
  return DEFAULT_RESPONSE_MESSAGE[code];
}

function parseContentLengthHeader(req: IncomingMessage): number | null {
  const header = req.headers["content-length"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== "string") {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export type ReadRequestBodyOptions = {
  maxBytes: number;
  timeoutMs?: number;
  encoding?: BufferEncoding;
};

function clampPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

export async function readRequestBodyWithLimit(
  req: IncomingMessage,
  options: ReadRequestBodyOptions
): Promise<string> {
  const maxBytes = clampPositiveInt(options.maxBytes, DEFAULT_WEBHOOK_MAX_BODY_BYTES);
  const timeoutMs = clampPositiveInt(options.timeoutMs, DEFAULT_WEBHOOK_BODY_TIMEOUT_MS);
  const encoding = options.encoding ?? "utf-8";

  const declaredLength = parseContentLengthHeader(req);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new RequestBodyLimitError({ code: "PAYLOAD_TOO_LARGE" });
  }

  return await new Promise<string>((resolve, reject) => {
    let done = false;
    let ended = false;
    let totalBytes = 0;
    const chunks: Buffer[] = [];

    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("close", onClose);
      clearTimeout(timer);
    };

    const finish = (cb: () => void) => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      cb();
    };

    const fail = (error: RequestBodyLimitError | Error) => {
      finish(() => reject(error));
    };

    const timer = setTimeout(() => {
      fail(new RequestBodyLimitError({ code: "REQUEST_BODY_TIMEOUT" }));
    }, timeoutMs);

    const onData = (chunk: Buffer | string) => {
      if (done) {
        return;
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        req.pause();
        fail(new RequestBodyLimitError({ code: "PAYLOAD_TOO_LARGE" }));
        return;
      }
      chunks.push(buffer);
    };

    const onEnd = () => {
      ended = true;
      finish(() => resolve(Buffer.concat(chunks).toString(encoding)));
    };

    const onError = (error: Error) => {
      if (done) {
        return;
      }
      fail(error);
    };

    const onClose = () => {
      if (done || ended) {
        return;
      }
      fail(new RequestBodyLimitError({ code: "CONNECTION_CLOSED" }));
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("close", onClose);
  });
}

export function parseUrlEncodedFormBody(rawBody: string): Record<string, string> {
  const params = new URLSearchParams(rawBody);
  const out: Record<string, string> = {};
  for (const [key, value] of params) {
    // Twilio sends unique keys; preserve first value if duplicates appear.
    if (!(key in out)) {
      out[key] = value;
    }
  }
  return out;
}
