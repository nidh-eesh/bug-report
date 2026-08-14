import type { ScreenshotAttachment } from "../core.js";
import { shareErrorConstructor } from "../shared-errors.js";

export interface ScreenshotCaptureProvider {
  isSupported(): boolean;
  capture(): Promise<ScreenshotAttachment>;
  /**
   * Set by providers that photograph the composited screen, where the bug
   * report would otherwise appear in the reporter's own screenshot. The form
   * hides its UI and waits for a paint before calling `capture`, and asks the
   * host to do the same through `onCapturingChange`.
   *
   * Providers that render the DOM themselves leave this unset: they already
   * skip the component through `data-bug-report-exclude`, and hiding it would
   * only flicker.
   */
  requiresHiddenUi?: boolean;
}

class ScreenshotCaptureErrorImplementation extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ScreenshotCaptureError";
    if (cause !== undefined) this.cause = cause;
  }
}

export const ScreenshotCaptureError = shareErrorConstructor(
  "ScreenshotCaptureError",
  ScreenshotCaptureErrorImplementation,
);
export type ScreenshotCaptureError = InstanceType<
  typeof ScreenshotCaptureError
>;
