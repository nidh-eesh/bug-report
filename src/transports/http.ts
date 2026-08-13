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
}

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  [extension: string]: unknown;
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

async function parseProblem(response: Response): Promise<ProblemDetails> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return (await response.json()) as ProblemDetails;
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
  if (!String(options.endpoint)) {
    throw new TypeError("createHttpTransport requires an endpoint.");
  }

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

    let response: Response;
    try {
      const headers =
        typeof options.headers === "function"
          ? await options.headers()
          : options.headers;
      response = await fetchImplementation(options.endpoint, {
        method: "POST",
        body: data,
        ...(headers ? { headers } : {}),
        ...(options.credentials ? { credentials: options.credentials } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (cause) {
      if (cause instanceof BugReportTransportError) throw cause;
      throw new BugReportTransportError(
        "The bug report could not reach the server.",
        { code: "NETWORK_ERROR", retryable: true, cause },
      );
    }

    if (!response.ok) {
      const problem = await parseProblem(response);
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
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
      const receipt = (await response.json()) as BugReportReceipt;
      return { ...receipt, provider: receipt.provider ?? "http" };
    } catch (cause) {
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
  };
}
