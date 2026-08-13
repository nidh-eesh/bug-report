import type { ScreenshotAttachment } from "../core.js";
import { shareErrorConstructor } from "../shared-errors.js";

export interface ScreenshotCaptureProvider {
  isSupported(): boolean;
  capture(): Promise<ScreenshotAttachment>;
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
