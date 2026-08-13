import {
  BugReportTransportError,
  type BugReport,
  type BugReportReceipt,
  type BugReportSubmit,
  serializeBugReport,
} from "../core.js";

export interface HttpTransportOptions {
  endpoint: string | URL;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  /** Maximum time to wait for the request. Defaults to 30 seconds. */
  timeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  [extension: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDateTime(value: string): boolean {
  const dateTime = value.trim();
  const rfc3339DateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  return rfc3339DateTime.test(dateTime) && Number.isFinite(Date.parse(dateTime));
}

function isBugReportReceipt(value: unknown): value is BugReportReceipt {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    value.id.length > 256
  ) {
    return false;
  }
  if (
    typeof value.acceptedAt !== "string" ||
    !isValidDateTime(value.acceptedAt)
  ) {
    return false;
  }
  if (value.provider !== undefined) {
    if (typeof value.provider !== "string" || value.provider.length > 100) {
      return false;
    }
  }
  return value.metadata === undefined || isRecord(value.metadata);
}

function codeForStatus(status: number): BugReportTransportError["code"] {
  if (status === 400 || status === 422) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

function resolveTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError(
      "createHttpTransport timeoutMs must be a finite number greater than or equal to 0.",
    );
  }
  return timeoutMs;
}

function timeoutReason(): Error | DOMException {
  if (typeof DOMException === "function") {
    return new DOMException("The bug report request timed out.", "TimeoutError");
  }
  const error = new Error("The bug report request timed out.");
  error.name = "TimeoutError";
  return error;
}

interface ComposedRequestSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

function waitForOperation<T>(
  operation: PromiseLike<T> | T,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      signal.reason ?? new Error("The bug report request was aborted."),
    );
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new Error("The bug report request was aborted."));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);

    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (cause) => {
        cleanup();
        reject(cause);
      },
    );
  });
}

function composeRequestSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): ComposedRequestSignal {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cleanedUp = false;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  if (!controller.signal.aborted) {
    timeoutId = setTimeout(() => controller.abort(timeoutReason()), timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

async function parseProblem(response: Response): Promise<ProblemDetails> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      const problem: unknown = await response.json();
      if (isRecord(problem)) return problem;
    } catch {
      // Fall back to the HTTP status below.
    }
  }

  return {
    status: response.status,
    title: response.statusText || "Bug report request failed",
  };
}

export function createHttpTransport(
  options: HttpTransportOptions,
): BugReportSubmit {
  const endpoint: unknown = options.endpoint;
  if (
    endpoint === null ||
    endpoint === undefined ||
    (typeof endpoint === "string" && endpoint.trim().length === 0)
  ) {
    throw new TypeError("createHttpTransport requires an endpoint.");
  }
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);

  return async (report: BugReport): Promise<BugReportReceipt> => {
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") {
      throw new BugReportTransportError(
        "Fetch is unavailable. Pass a fetch implementation to createHttpTransport.",
        { code: "NETWORK_ERROR", retryable: true },
      );
    }

    const data = new FormData();
    data.append(
      "report",
      new Blob([JSON.stringify(serializeBugReport(report))], {
        type: "application/json",
      }),
      "report.json",
    );
    if (report.attachment) {
      data.append(
        "attachment",
        report.attachment.blob,
        report.attachment.filename,
      );
    }

    const requestSignal = composeRequestSignal(options.signal, timeoutMs);
    try {
      let response: Response;
      try {
        const headers =
          typeof options.headers === "function"
            ? await waitForOperation(options.headers(), requestSignal.signal)
            : options.headers;
        response = await waitForOperation(
          fetchImplementation(options.endpoint, {
            method: "POST",
            body: data,
            ...(headers ? { headers } : {}),
            ...(options.credentials
              ? { credentials: options.credentials }
              : {}),
            signal: requestSignal.signal,
          }),
          requestSignal.signal,
        );
      } catch (cause) {
        if (cause instanceof BugReportTransportError) throw cause;
        throw new BugReportTransportError(
          "The bug report could not reach the server.",
          {
            code: "NETWORK_ERROR",
            retryable: true,
            cause,
          },
        );
      }

      if (!response.ok) {
        let problem: ProblemDetails;
        try {
          problem = await waitForOperation(
            parseProblem(response),
            requestSignal.signal,
          );
        } catch (cause) {
          throw new BugReportTransportError(
            "The bug report could not reach the server.",
            { code: "NETWORK_ERROR", retryable: true, cause },
          );
        }
        const retryAfterMs = parseRetryAfter(
          response.headers.get("retry-after"),
        );
        throw new BugReportTransportError(
          problem.detail ??
            problem.title ??
            `The bug report request failed with status ${response.status}.`,
          {
            code: codeForStatus(response.status),
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
          },
        );
      }

      if (response.status === 204) {
        return { provider: "http" };
      }

      try {
        const receipt: unknown = await waitForOperation(
          response.json(),
          requestSignal.signal,
        );
        if (!isBugReportReceipt(receipt)) {
          throw new TypeError("The response does not match BugReportReceipt.");
        }
        return { ...receipt, provider: receipt.provider ?? "http" };
      } catch (cause) {
        if (requestSignal.signal.aborted) {
          throw new BugReportTransportError(
            "The bug report could not reach the server.",
            { code: "NETWORK_ERROR", retryable: true, cause },
          );
        }
        throw new BugReportTransportError(
          "The server accepted the bug report but returned an invalid receipt.",
          {
            code: "INVALID_RESPONSE",
            status: response.status,
            retryable: false,
            cause,
          },
        );
      }
    } finally {
      requestSignal.cleanup();
    }
  };
}
