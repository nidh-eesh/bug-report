import type { BugReport, BugReportReceipt, BugReportSubmit } from "../core.js";

export interface SentryFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  url?: string;
  source?: string;
  tags?: Record<string, string>;
}

export interface SentryAttachment {
  data: Uint8Array;
  filename: string;
  contentType?: string;
}

export interface SentryFeedbackHint {
  includeReplay?: boolean;
  attachments?: SentryAttachment[];
}

export type SentrySendFeedback = (
  params: SentryFeedbackParams,
  hint?: SentryFeedbackHint,
) => unknown | Promise<unknown>;

export interface SentryTransportOptions {
  sendFeedback: SentrySendFeedback;
  includeReplay?: boolean;
  tags?: Record<string, string>;
  source?: string;
}

function formatMessage(report: BugReport): string {
  const sections = [report.message];
  if (report.details?.steps) {
    sections.push(`Steps to reproduce:\n${report.details.steps}`);
  }
  if (report.details?.expected) {
    sections.push(`Expected:\n${report.details.expected}`);
  }
  if (report.details?.actual) {
    sections.push(`Got instead:\n${report.details.actual}`);
  }
  return sections.join("\n\n");
}

function eventIdFromResult(result: unknown): string | undefined {
  if (typeof result === "string" && result) return result;
  if (
    result &&
    typeof result === "object" &&
    "eventId" in result &&
    typeof result.eventId === "string"
  ) {
    return result.eventId;
  }
  return undefined;
}

/**
 * Adapts the package report to Sentry's `sendFeedback` API without importing
 * an SDK. Pass `Sentry.sendFeedback` from the host.
 */
export function createSentryTransport(
  options: SentryTransportOptions,
): BugReportSubmit {
  if (typeof options.sendFeedback !== "function") {
    throw new TypeError("createSentryTransport requires sendFeedback.");
  }

  return async (report: BugReport): Promise<BugReportReceipt> => {
    const tags: Record<string, string> = {
      ...options.tags,
      ...report.context?.tags,
      ...(report.details?.severity
        ? { severity: report.details.severity }
        : {}),
    };
    const params: SentryFeedbackParams = {
      message: formatMessage(report),
      source: options.source ?? "@nidh-eesh/bug-report",
      ...(report.contact?.name ? { name: report.contact.name } : {}),
      ...(report.contact?.email ? { email: report.contact.email } : {}),
      ...(report.context?.url ? { url: report.context.url } : {}),
      ...(Object.keys(tags).length > 0 ? { tags } : {}),
    };

    const hint: SentryFeedbackHint = {
      ...(options.includeReplay !== undefined
        ? { includeReplay: options.includeReplay }
        : {}),
    };
    if (report.attachment) {
      hint.attachments = [
        {
          data: new Uint8Array(await report.attachment.blob.arrayBuffer()),
          filename: report.attachment.filename,
          contentType: report.attachment.contentType,
        },
      ];
    }

    const result = await options.sendFeedback(
      params,
      Object.keys(hint).length > 0 ? hint : undefined,
    );
    const id = eventIdFromResult(result);
    return { ...(id ? { id } : {}), provider: "sentry" };
  };
}
