import type { ScreenshotAttachment } from "../core.js";

export interface ScreenshotCaptureProvider {
  isSupported(): boolean;
  capture(): Promise<ScreenshotAttachment>;
}

export class ScreenshotCaptureError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ScreenshotCaptureError";
    if (cause !== undefined) this.cause = cause;
  }
}
