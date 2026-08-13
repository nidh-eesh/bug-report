export const BUG_REPORT_SCHEMA_VERSION = 1 as const;

export const BUG_REPORT_SEVERITIES = [
  "annoying",
  "workaround",
  "blocking",
  "data",
] as const;

export type BugReportSeverity = (typeof BUG_REPORT_SEVERITIES)[number];
export type ScreenshotSource = "upload" | "capture";

export interface BugReportContact {
  name?: string;
  email?: string;
}

export interface BugReportDetails {
  severity?: BugReportSeverity;
  steps?: string;
  expected?: string;
  actual?: string;
}

export interface BugReportContext {
  url?: string;
  userAgent?: string;
  locale?: string;
  appVersion?: string;
  viewport?: {
    width: number;
    height: number;
    devicePixelRatio?: number;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface ScreenshotAttachment {
  blob: Blob;
  filename: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  size: number;
  source: ScreenshotSource;
  width?: number;
  height?: number;
}

export type ScreenshotAttachmentMetadata = Omit<
  ScreenshotAttachment,
  "blob"
>;

export interface BugReportInput {
  anonymous: boolean;
  message: string;
  includeTechnicalContext: boolean;
  contact?: BugReportContact;
  details?: BugReportDetails;
  context?: BugReportContext;
  attachment?: ScreenshotAttachment;
}

export interface BugReport extends Omit<
  BugReportInput,
  "contact" | "context" | "details"
> {
  id: string;
  schemaVersion: typeof BUG_REPORT_SCHEMA_VERSION;
  submittedAt: string;
  contact?: BugReportContact;
  details?: BugReportDetails;
  context?: BugReportContext;
}

export interface SerializedBugReport extends Omit<BugReport, "attachment"> {
  attachment?: ScreenshotAttachmentMetadata;
}

export interface BugReportReceipt {
  id?: string;
  acceptedAt?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export type BugReportSubmit = (
  report: BugReport,
) => Promise<BugReportReceipt | void> | BugReportReceipt | void;

export interface BugReportValidationIssue {
  field: string;
  code: "required" | "invalid" | "too_large" | "unsupported";
  message: string;
}

export class BugReportValidationError extends Error {
  readonly issues: readonly BugReportValidationIssue[];

  constructor(issues: readonly BugReportValidationIssue[]) {
    super(issues[0]?.message ?? "The bug report is invalid.");
    this.name = "BugReportValidationError";
    this.issues = issues;
  }
}

export type BugReportTransportErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

export interface BugReportTransportErrorOptions {
  code?: BugReportTransportErrorCode;
  status?: number;
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: unknown;
}

export class BugReportTransportError extends Error {
  readonly code: BugReportTransportErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;

  constructor(message: string, options: BugReportTransportErrorOptions = {}) {
    super(message);
    this.name = "BugReportTransportError";
    this.code = options.code ?? "UNKNOWN";
    this.retryable = options.retryable ?? false;
    if (options.status !== undefined) this.status = options.status;
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export interface CreateBugReportOptions {
  id?: string;
  now?: () => Date;
}

export interface CreateScreenshotAttachmentOptions {
  filename: string;
  source: ScreenshotSource;
  width?: number;
  height?: number;
  maxBytes?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function readableByteLimit(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${Math.floor(bytes / 1024 / 1024)} MB`;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `bug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanContact(
  contact: BugReportContact | undefined,
): BugReportContact | undefined {
  if (!contact) return undefined;
  const name = optionalTrimmed(contact.name);
  const email = optionalTrimmed(contact.email);
  if (!name && !email) return undefined;
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
  };
}

function cleanDetails(
  details: BugReportDetails | undefined,
): BugReportDetails | undefined {
  if (!details) return undefined;
  const steps = optionalTrimmed(details.steps);
  const expected = optionalTrimmed(details.expected);
  const actual = optionalTrimmed(details.actual);
  const result: BugReportDetails = {
    ...(details.severity ? { severity: details.severity } : {}),
    ...(steps ? { steps } : {}),
    ...(expected ? { expected } : {}),
    ...(actual ? { actual } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

export function validateBugReportInput(input: BugReportInput): void {
  const issues: BugReportValidationIssue[] = [];
  const message = input.message.trim();
  const email = input.contact?.email?.trim();

  if (message.length < 3) {
    issues.push({
      field: "message",
      code: "required",
      message: "Tell us a little about what you saw first.",
    });
  }
  if (message.length > 10_000) {
    issues.push({
      field: "message",
      code: "too_large",
      message: "The description must be 10,000 characters or fewer.",
    });
  }

  if (!input.anonymous && (!email || !EMAIL_PATTERN.test(email))) {
    issues.push({
      field: "contact.email",
      code: "invalid",
      message: "Enter a valid email address or report anonymously.",
    });
  }
  if (!input.anonymous && email && email.length > 320) {
    issues.push({
      field: "contact.email",
      code: "too_large",
      message: "The email address is too long.",
    });
  }
  if (!input.anonymous && (input.contact?.name?.trim().length ?? 0) > 200) {
    issues.push({
      field: "contact.name",
      code: "too_large",
      message: "The name must be 200 characters or fewer.",
    });
  }

  if (
    input.details?.severity &&
    !BUG_REPORT_SEVERITIES.includes(input.details.severity)
  ) {
    issues.push({
      field: "details.severity",
      code: "invalid",
      message: "Choose a supported severity.",
    });
  }

  if (input.attachment) {
    if (!SUPPORTED_IMAGE_TYPES.has(input.attachment.contentType)) {
      issues.push({
        field: "attachment",
        code: "unsupported",
        message: "Use a PNG, JPEG, or WebP screenshot.",
      });
    }
    if (input.attachment.size > DEFAULT_MAX_ATTACHMENT_BYTES) {
      issues.push({
        field: "attachment",
        code: "too_large",
        message: "The screenshot must be 10 MB or smaller.",
      });
    }
    if (input.attachment.size === 0) {
      issues.push({
        field: "attachment",
        code: "invalid",
        message: "The screenshot file is empty.",
      });
    }
  }

  const detailLimits: Array<[string, string | undefined, number]> = [
    ["details.steps", input.details?.steps, 10_000],
    ["details.expected", input.details?.expected, 5_000],
    ["details.actual", input.details?.actual, 5_000],
  ];
  for (const [field, value, limit] of detailLimits) {
    if ((value?.trim().length ?? 0) > limit) {
      issues.push({
        field,
        code: "too_large",
        message: `This field must be ${limit.toLocaleString("en-US")} characters or fewer.`,
      });
    }
  }

  if (issues.length > 0) throw new BugReportValidationError(issues);
}

export function createScreenshotAttachment(
  blob: Blob,
  options: CreateScreenshotAttachmentOptions,
): ScreenshotAttachment {
  const contentType = blob.type.toLowerCase();
  const issues: BugReportValidationIssue[] = [];
  const maxBytes = Math.min(
    options.maxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES,
    DEFAULT_MAX_ATTACHMENT_BYTES,
  );
  const untrustedFilename =
    options.filename.trim().split(/[\\/]/).pop() ?? "";
  const filename = Array.from(untrustedFilename)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join("");

  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    issues.push({
      field: "attachment",
      code: "unsupported",
      message: "Use a PNG, JPEG, or WebP screenshot.",
    });
  }
  if (!filename) {
    issues.push({
      field: "attachment.filename",
      code: "required",
      message: "The screenshot needs a filename.",
    });
  }
  if (filename.length > 255) {
    issues.push({
      field: "attachment.filename",
      code: "too_large",
      message: "The screenshot filename must be 255 characters or fewer.",
    });
  }
  if (blob.size === 0) {
    issues.push({
      field: "attachment",
      code: "invalid",
      message: "The screenshot file is empty.",
    });
  }
  if (blob.size > maxBytes) {
    issues.push({
      field: "attachment",
      code: "too_large",
      message: `The screenshot must be ${readableByteLimit(maxBytes)} or smaller.`,
    });
  }
  if (issues.length > 0) throw new BugReportValidationError(issues);

  return {
    blob,
    filename,
    contentType: contentType as ScreenshotAttachment["contentType"],
    size: blob.size,
    source: options.source,
    ...(options.width !== undefined ? { width: options.width } : {}),
    ...(options.height !== undefined ? { height: options.height } : {}),
  };
}

export function createBugReport(
  input: BugReportInput,
  options: CreateBugReportOptions = {},
): BugReport {
  validateBugReportInput(input);

  const contact = input.anonymous ? undefined : cleanContact(input.contact);
  const details = cleanDetails(input.details);
  const context = input.includeTechnicalContext ? input.context : undefined;

  return {
    schemaVersion: BUG_REPORT_SCHEMA_VERSION,
    id: options.id ?? createId(),
    submittedAt: (options.now ?? (() => new Date()))().toISOString(),
    anonymous: input.anonymous,
    message: input.message.trim(),
    includeTechnicalContext: input.includeTechnicalContext,
    ...(contact ? { contact } : {}),
    ...(details ? { details } : {}),
    ...(context ? { context } : {}),
    ...(input.attachment ? { attachment: input.attachment } : {}),
  };
}

export function serializeBugReport(report: BugReport): SerializedBugReport {
  const { attachment, ...serializable } = report;
  return {
    ...serializable,
    ...(attachment
      ? {
          attachment: {
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.size,
            source: attachment.source,
            ...(attachment.width !== undefined
              ? { width: attachment.width }
              : {}),
            ...(attachment.height !== undefined
              ? { height: attachment.height }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * Explicit opt-in helper for consumers with their own redaction policy.
 * The form and built-in transports never call this automatically.
 */
export function redactBugReport(report: BugReport): BugReport {
  const { contact: _contact, context: _context, ...redacted } = report;
  return { ...redacted };
}
