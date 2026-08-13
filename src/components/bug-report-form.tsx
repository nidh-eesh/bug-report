import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
} from "react";

import {
  BugReportValidationError,
  createBugReport,
  createScreenshotAttachment,
  validateBugReportInput,
  type BugReport,
  type BugReportContact,
  type BugReportContext,
  type BugReportReceipt,
  type BugReportSeverity,
  type BugReportSubmit,
  type ScreenshotAttachment,
} from "../core.js";
import type { ScreenshotCaptureProvider } from "../capture/types.js";
import {
  CameraIcon,
  CheckIcon,
  ChevronIcon,
  IncognitoIcon,
  PaperclipIcon,
} from "./icons.js";
import { SeveritySelect } from "./severity-select.js";

export type BugReportTheme = "light" | "dark" | "auto";

export interface BugReportColors {
  surface: string;
  field: string;
  fieldFocus: string;
  text: string;
  muted: string;
  label: string;
  border: string;
  divider: string;
  accent: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
}

export interface BugReportCopy {
  title: string;
  anonymousLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  messageError: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailError: string;
  addDetails: string;
  fewerDetails: string;
  severityLabel: string;
  stepsLabel: string;
  stepsPlaceholder: string;
  expectedLabel: string;
  expectedPlaceholder: string;
  actualLabel: string;
  actualPlaceholder: string;
  uploadScreenshot: string;
  captureScreenshot: string;
  removeScreenshot: string;
  screenshotPreview: string;
  technicalContext: string;
  send: string;
  sending: string;
  capturing: string;
  failure: string;
  successTitle: string;
  successIdentified: string;
  successAnonymous: string;
  reportAnother: string;
}

export const DEFAULT_BUG_REPORT_COPY: BugReportCopy = {
  title: "Report a bug",
  anonymousLabel: "Report anonymously",
  messageLabel: "What happened?",
  messagePlaceholder: "What happened? Take your time — we read every one.",
  messageError: "Tell us a little about what you saw first.",
  nameLabel: "Name",
  namePlaceholder: "Your name",
  emailLabel: "Email",
  emailPlaceholder: "Email address",
  emailError: "That address looks off — or turn on anonymous and skip it.",
  addDetails: "Add details that help us fix it faster",
  fewerDetails: "Fewer details",
  severityLabel: "How much is it in your way?",
  stepsLabel: "Steps to reproduce",
  stepsPlaceholder: "1. …",
  expectedLabel: "Expected",
  expectedPlaceholder: "Expected…",
  actualLabel: "Got instead",
  actualPlaceholder: "Got instead…",
  uploadScreenshot: "Attach a screenshot",
  captureScreenshot: "Capture this page",
  removeScreenshot: "Remove screenshot",
  screenshotPreview: "Screenshot preview",
  technicalContext:
    "Send the page you were on and a few technical details about this device — it helps track this down.",
  send: "Send report",
  sending: "Sending…",
  capturing: "Capturing…",
  failure: "We couldn't send your report. Check your connection and try again.",
  successTitle: "Got it — thank you.",
  successIdentified:
    "Your report was sent. The team can use your contact details if they need to follow up.",
  successAnonymous:
    "Your report was sent without your name or email. It included the same details you chose above.",
  reportAnother: "Report something else",
};

type BugReportCssProperties = CSSProperties & Record<`--nbr-${string}`, string>;

export interface BugReportFormProps {
  onSubmit: BugReportSubmit;
  reporter?: BugReportContact;
  context?:
    BugReportContext | (() => BugReportContext | Promise<BugReportContext>);
  capture?: ScreenshotCaptureProvider;
  theme?: BugReportTheme;
  colors?: Partial<BugReportColors>;
  accentColor?: string;
  primaryColor?: string;
  fontFamily?: string;
  monoFontFamily?: string;
  copy?: Partial<BugReportCopy>;
  defaultAnonymous?: boolean;
  defaultExpanded?: boolean;
  defaultIncludeTechnicalContext?: boolean;
  collectBrowserContext?: boolean;
  allowScreenshotUpload?: boolean;
  maxAttachmentBytes?: number;
  className?: string;
  style?: CSSProperties;
  onAnonymousChange?(anonymous: boolean): void;
  onSuccess?(receipt: BugReportReceipt | void, report: BugReport): void;
  onError?(error: unknown): void;
}

interface FieldErrors {
  message?: string;
  email?: string;
  attachment?: string;
}

function clearFieldError(
  current: FieldErrors,
  field: keyof FieldErrors,
): FieldErrors {
  const next = { ...current };
  delete next[field];
  return next;
}

function mergeContext(
  provided: BugReportContext | undefined,
  collectBrowserContext: boolean,
): BugReportContext | undefined {
  const browserContext: BugReportContext = {};
  if (collectBrowserContext && typeof window !== "undefined") {
    browserContext.url = window.location.href;
    browserContext.viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }
  if (collectBrowserContext && typeof navigator !== "undefined") {
    browserContext.userAgent = navigator.userAgent;
    browserContext.locale = navigator.language;
  }

  const merged = { ...browserContext, ...provided };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cssVariables(
  colors: Partial<BugReportColors> | undefined,
  accentColor: string | undefined,
  primaryColor: string | undefined,
  fontFamily: string | undefined,
  monoFontFamily: string | undefined,
): BugReportCssProperties {
  const variables: BugReportCssProperties = {};
  const values = {
    ...colors,
    ...(accentColor ? { accent: accentColor } : {}),
    ...(primaryColor ? { primary: primaryColor } : {}),
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) variables[`--nbr-${key}`] = value;
  }
  if (fontFamily) variables["--nbr-font-family"] = fontFamily;
  if (monoFontFamily) variables["--nbr-mono-font-family"] = monoFontFamily;
  return variables;
}

export function BugReportForm({
  onSubmit,
  reporter,
  context,
  capture,
  theme = "light",
  colors,
  accentColor,
  primaryColor,
  fontFamily,
  monoFontFamily,
  copy: copyOverrides,
  defaultAnonymous = false,
  defaultExpanded = false,
  defaultIncludeTechnicalContext = true,
  collectBrowserContext = true,
  allowScreenshotUpload = true,
  maxAttachmentBytes = 10 * 1024 * 1024,
  className,
  style,
  onAnonymousChange,
  onSuccess,
  onError,
}: BugReportFormProps) {
  const copy = useMemo(
    () => ({ ...DEFAULT_BUG_REPORT_COPY, ...copyOverrides }),
    [copyOverrides],
  );
  const [anonymous, setAnonymous] = useState(defaultAnonymous);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [includeTechnicalContext, setIncludeTechnicalContext] = useState(
    defaultIncludeTechnicalContext,
  );
  const [name, setName] = useState(reporter?.name ?? "");
  const [email, setEmail] = useState(reporter?.email ?? "");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<BugReportSeverity>("annoying");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [attachment, setAttachment] = useState<
    ScreenshotAttachment | undefined
  >();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [transportFailed, setTransportFailed] = useState(false);
  const [phase, setPhase] = useState<
    "form" | "capturing" | "sending" | "success"
  >("form");
  const [captureSupported, setCaptureSupported] = useState(false);
  const previousReporter = useRef({
    name: reporter?.name ?? "",
    email: reporter?.email ?? "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageId = useId();
  const messageErrorId = useId();
  const emailErrorId = useId();
  const detailsId = useId();
  const anonymousTooltipId = useId();

  useEffect(() => {
    const previous = previousReporter.current;
    const nextName = reporter?.name ?? "";
    const nextEmail = reporter?.email ?? "";
    setName((current) => (current === previous.name ? nextName : current));
    setEmail((current) => (current === previous.email ? nextEmail : current));
    previousReporter.current = { name: nextName, email: nextEmail };
  }, [reporter?.email, reporter?.name]);

  useEffect(() => {
    setCaptureSupported(Boolean(capture?.isSupported()));
  }, [capture]);

  const previewUrl = useMemo(
    () => (attachment ? URL.createObjectURL(attachment.blob) : undefined),
    [attachment],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const toggleAnonymous = () => {
    const next = !anonymous;
    setAnonymous(next);
    setErrors((current) => clearFieldError(current, "email"));
    onAnonymousChange?.(next);
  };

  const setUploadedFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setAttachment(
        createScreenshotAttachment(file, {
          filename: file.name,
          source: "upload",
          maxBytes: maxAttachmentBytes,
        }),
      );
      setErrors((current) => clearFieldError(current, "attachment"));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        attachment:
          error instanceof Error ? error.message : "The screenshot is invalid.",
      }));
    }
    event.target.value = "";
  };

  const captureScreenshot = async () => {
    if (!capture) return;
    setPhase("capturing");
    setErrors((current) => clearFieldError(current, "attachment"));
    try {
      const result = await capture.capture();
      if (result.size > maxAttachmentBytes) {
        throw new BugReportValidationError([
          {
            field: "attachment",
            code: "too_large",
            message: `The screenshot must be ${readableSize(maxAttachmentBytes)} or smaller.`,
          },
        ]);
      }
      setAttachment(result);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        attachment:
          error instanceof Error
            ? error.message
            : "The page could not be captured.",
      }));
    } finally {
      setPhase("form");
    }
  };

  const resolveContext = async (): Promise<BugReportContext | undefined> => {
    const provided = typeof context === "function" ? await context() : context;
    return mergeContext(provided, collectBrowserContext);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setTransportFailed(false);
    setPhase("sending");

    try {
      const input = {
        anonymous,
        message,
        includeTechnicalContext,
        contact: { name, email },
        details: { severity, steps, expected, actual },
        ...(attachment ? { attachment } : {}),
      };
      validateBugReportInput(input);
      const resolvedContext = includeTechnicalContext
        ? await resolveContext()
        : undefined;
      const report = createBugReport({
        ...input,
        ...(resolvedContext ? { context: resolvedContext } : {}),
      });
      const receipt = await onSubmit(report);
      setPhase("success");
      if (onSuccess) {
        void Promise.resolve()
          .then(() => onSuccess(receipt, report))
          .catch((callbackError: unknown) => onError?.(callbackError));
      }
    } catch (error) {
      if (error instanceof BugReportValidationError) {
        const next: FieldErrors = {};
        for (const issue of error.issues) {
          if (issue.field === "message") next.message = copy.messageError;
          else if (issue.field === "contact.email")
            next.email = copy.emailError;
          else if (issue.field.startsWith("attachment")) {
            next.attachment = issue.message;
          }
        }
        setErrors(next);
      } else {
        setTransportFailed(true);
      }
      setPhase("form");
      if (!(error instanceof BugReportValidationError)) onError?.(error);
    }
  };

  const reset = () => {
    setMessage("");
    setSeverity("annoying");
    setSteps("");
    setExpected("");
    setActual("");
    setAttachment(undefined);
    setErrors({});
    setTransportFailed(false);
    setPhase("form");
  };

  const rootStyle: BugReportCssProperties = {
    ...cssVariables(
      colors,
      accentColor,
      primaryColor,
      fontFamily,
      monoFontFamily,
    ),
    ...style,
  };
  const busy = phase === "sending" || phase === "capturing";
  return (
    <section
      className={["nbr", "nbr-card", className].filter(Boolean).join(" ")}
      data-bug-report="form"
      data-theme={theme}
      style={rootStyle}
    >
      {phase === "success" ? (
        <div aria-live="polite" className="nbr-success">
          <span className="nbr-success__icon">
            <CheckIcon height="18" width="18" />
          </span>
          <h2>{copy.successTitle}</h2>
          <p>{anonymous ? copy.successAnonymous : copy.successIdentified}</p>
          <button className="nbr-link-button" onClick={reset} type="button">
            {copy.reportAnother}
          </button>
        </div>
      ) : (
        <form
          aria-busy={busy}
          className="nbr-form"
          noValidate
          onSubmit={submit}
        >
          <header className="nbr-header">
            <h2>{copy.title}</h2>
            <span className="nbr-anonymous">
              <span
                className="nbr-tooltip"
                id={anonymousTooltipId}
                role="tooltip"
              >
                {copy.anonymousLabel}
              </span>
              <button
                aria-checked={anonymous}
                aria-describedby={anonymousTooltipId}
                aria-label={copy.anonymousLabel}
                className="nbr-switch"
                data-checked={anonymous ? "true" : "false"}
                disabled={busy}
                onClick={toggleAnonymous}
                role="switch"
                type="button"
              >
                <span className="nbr-switch__knob">
                  <IncognitoIcon height="13" width="13" />
                </span>
              </button>
            </span>
          </header>

          <div className="nbr-field-group">
            <label className="nbr-sr-only" htmlFor={messageId}>
              {copy.messageLabel}
            </label>
            <textarea
              aria-describedby={errors.message ? messageErrorId : undefined}
              aria-invalid={Boolean(errors.message)}
              disabled={busy}
              id={messageId}
              maxLength={10_000}
              onChange={(event) => {
                setMessage(event.target.value);
                setErrors((current) => clearFieldError(current, "message"));
              }}
              placeholder={copy.messagePlaceholder}
              value={message}
            />
            {errors.message ? (
              <p className="nbr-error" id={messageErrorId}>
                {errors.message}
              </p>
            ) : null}
          </div>

          {!anonymous ? (
            <div className="nbr-contact" data-state="visible">
              <label className="nbr-sr-only" htmlFor={`${messageId}-name`}>
                {copy.nameLabel}
              </label>
              <input
                autoComplete="name"
                disabled={busy}
                id={`${messageId}-name`}
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
                placeholder={copy.namePlaceholder}
                type="text"
                value={name}
              />
              <label className="nbr-sr-only" htmlFor={`${messageId}-email`}>
                {copy.emailLabel}
              </label>
              <input
                aria-describedby={errors.email ? emailErrorId : undefined}
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                disabled={busy}
                id={`${messageId}-email`}
                inputMode="email"
                maxLength={320}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrors((current) => clearFieldError(current, "email"));
                }}
                placeholder={copy.emailPlaceholder}
                type="email"
                value={email}
              />
              {errors.email ? (
                <p className="nbr-error" id={emailErrorId}>
                  {errors.email}
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            aria-controls={detailsId}
            aria-expanded={expanded}
            className="nbr-details-toggle"
            disabled={busy}
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            <span>{expanded ? copy.fewerDetails : copy.addDetails}</span>
            <ChevronIcon
              direction={expanded ? "up" : "down"}
              height="13"
              width="13"
            />
          </button>

          {expanded ? (
            <div className="nbr-details" id={detailsId}>
              <SeveritySelect
                disabled={busy}
                label={copy.severityLabel}
                onChange={setSeverity}
                value={severity}
              />

              <label className="nbr-field-group">
                <span className="nbr-label">{copy.stepsLabel}</span>
                <textarea
                  className="nbr-textarea--short"
                  disabled={busy}
                  maxLength={10_000}
                  onChange={(event) => setSteps(event.target.value)}
                  placeholder={copy.stepsPlaceholder}
                  value={steps}
                />
              </label>

              <div className="nbr-paired-fields">
                <label>
                  <span className="nbr-sr-only">{copy.expectedLabel}</span>
                  <input
                    disabled={busy}
                    maxLength={5_000}
                    onChange={(event) => setExpected(event.target.value)}
                    placeholder={copy.expectedPlaceholder}
                    type="text"
                    value={expected}
                  />
                </label>
                <label>
                  <span className="nbr-sr-only">{copy.actualLabel}</span>
                  <input
                    disabled={busy}
                    maxLength={5_000}
                    onChange={(event) => setActual(event.target.value)}
                    placeholder={copy.actualPlaceholder}
                    type="text"
                    value={actual}
                  />
                </label>
              </div>

              <div className="nbr-attachment">
                <div className="nbr-attachment__actions">
                  {allowScreenshotUpload ? (
                    <>
                      <input
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="Choose screenshot"
                        className="nbr-file-input"
                        disabled={busy}
                        onChange={setUploadedFile}
                        ref={fileInputRef}
                        type="file"
                      />
                      <button
                        className="nbr-secondary-button"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                      >
                        <PaperclipIcon height="16" width="16" />
                        <span>{copy.uploadScreenshot}</span>
                      </button>
                    </>
                  ) : null}
                  {captureSupported ? (
                    <button
                      className="nbr-secondary-button"
                      disabled={busy}
                      onClick={captureScreenshot}
                      type="button"
                    >
                      <CameraIcon height="16" width="16" />
                      <span>
                        {phase === "capturing"
                          ? copy.capturing
                          : copy.captureScreenshot}
                      </span>
                    </button>
                  ) : null}
                </div>
                {attachment ? (
                  <div className="nbr-attachment__file">
                    {previewUrl ? (
                      <img alt={copy.screenshotPreview} src={previewUrl} />
                    ) : null}
                    <span className="nbr-attachment__metadata">
                      <span title={attachment.filename}>
                        {attachment.filename}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{readableSize(attachment.size)}</span>
                    </span>
                    <button
                      aria-label={copy.removeScreenshot}
                      className="nbr-remove"
                      disabled={busy}
                      onClick={() => setAttachment(undefined)}
                      type="button"
                    >
                      remove
                    </button>
                  </div>
                ) : null}
                {errors.attachment ? (
                  <p className="nbr-error" role="alert">
                    {errors.attachment}
                  </p>
                ) : null}
              </div>

              <label className="nbr-context-choice">
                <input
                  checked={includeTechnicalContext}
                  disabled={busy}
                  onChange={(event) =>
                    setIncludeTechnicalContext(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>{copy.technicalContext}</span>
              </label>
            </div>
          ) : null}

          {transportFailed ? (
            <p
              aria-label={copy.failure}
              className="nbr-error nbr-submit-error"
              role="alert"
            >
              {copy.failure}
            </p>
          ) : null}

          <button className="nbr-submit" disabled={busy} type="submit">
            {phase === "sending" ? (
              <span aria-hidden="true" className="nbr-spinner" />
            ) : null}
            <span>{phase === "sending" ? copy.sending : copy.send}</span>
          </button>
        </form>
      )}
    </section>
  );
}
