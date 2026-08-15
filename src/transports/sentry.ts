import type { BugReport, BugReportReceipt, BugReportSubmit } from "../core.js";

export interface SentryFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  url?: string;
  source?: string;
  tags?: Record<string, string>;
}

/**
 * Keeps the always-present `url` key off the exported type, which stays
 * assignable to Sentry's `SendFeedbackParams` and its `url?: string`.
 */
type OutgoingFeedbackParams = Omit<SentryFeedbackParams, "url"> & {
  url: string | undefined;
};

export interface SentryAttachment {
  data: Uint8Array;
  filename: string;
  contentType?: string;
}

export interface SentryFeedbackHint {
  includeReplay?: boolean;
  attachments?: SentryAttachment[];
  /** Structural subset of Sentry's EventHint.captureContext. */
  captureContext?: SentryCaptureContext;
}

export interface SentryCaptureContext {
  extra?: Record<string, unknown>;
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

function buildCaptureContext(report: BugReport): SentryCaptureContext {
  const context = report.context;
  const extra: Record<string, unknown> = {
    ...(context?.extra ?? {}),
    reportId: report.id,
    submittedAt: report.submittedAt,
    ...(context?.userAgent ? { userAgent: context.userAgent } : {}),
    ...(context?.locale ? { locale: context.locale } : {}),
    ...(context?.appVersion ? { appVersion: context.appVersion } : {}),
    ...(context?.viewport ? { viewport: context.viewport } : {}),
  };

  return { extra };
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
      // This is the package report ID, not a Sentry event ID. Keep it as a
      // searchable tag instead of passing it as associatedEventId.
      bug_report_id: report.id,
    };
    const params: OutgoingFeedbackParams = {
      message: formatMessage(report),
      source: options.source ?? "react-bug-report",
      ...(report.contact?.name ? { name: report.contact.name } : {}),
      ...(report.contact?.email ? { email: report.contact.email } : {}),
      // Sentry substitutes the current page address for a missing url, so keep
      // the key even when empty. `undefined` overrides it; an absent key does
      // not. Not a conditional spread, deliberately.
      url: report.context?.url || undefined,
      ...(Object.keys(tags).length > 0 ? { tags } : {}),
    };

    const hint: SentryFeedbackHint = {
      ...(options.includeReplay !== undefined
        ? { includeReplay: options.includeReplay }
        : {}),
      captureContext: buildCaptureContext(report),
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
      params as SentryFeedbackParams,
      hint,
    );
    const id = eventIdFromResult(result);
    return { ...(id ? { id } : {}), provider: "sentry" };
  };
}
