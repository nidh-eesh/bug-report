export {
  BUG_REPORT_SCHEMA_VERSION,
  BUG_REPORT_SEVERITIES,
  BugReportTransportError,
  BugReportValidationError,
  createBugReport,
  createScreenshotAttachment,
  formatBytes,
  redactBugReport,
  serializeBugReport,
  validateBugReportInput,
} from "./core.js";
export type {
  BugReport,
  BugReportContact,
  BugReportContext,
  BugReportDetails,
  BugReportInput,
  BugReportReceipt,
  BugReportSeverity,
  BugReportSubmit,
  BugReportTransportErrorCode,
  BugReportTransportErrorOptions,
  BugReportValidationIssue,
  CreateBugReportOptions,
  CreateScreenshotAttachmentOptions,
  ScreenshotAttachment,
  ScreenshotAttachmentMetadata,
  ScreenshotSource,
  SerializedBugReport,
} from "./core.js";
export {
  BugReportForm,
  DEFAULT_BUG_REPORT_COPY,
} from "./components/bug-report-form.js";
export type {
  BugReportColors,
  BugReportCopy,
  BugReportFormProps,
  BugReportTheme,
} from "./components/bug-report-form.js";
export {
  BugReportDialog,
  BugReportWidget,
} from "./components/bug-report-dialog.js";
export type {
  BugReportDialogProps,
  BugReportWidgetPosition,
  BugReportWidgetProps,
} from "./components/bug-report-dialog.js";
export {
  ScreenshotCaptureError,
} from "./capture/types.js";
export type { ScreenshotCaptureProvider } from "./capture/types.js";
