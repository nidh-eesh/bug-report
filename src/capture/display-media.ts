import {
  BugReportValidationError,
  createScreenshotAttachment,
} from "../core.js";
import {
  ScreenshotCaptureError,
  type ScreenshotCaptureProvider,
} from "./types.js";

export interface DisplayMediaCaptureOptions {
  mediaDevices?: MediaDevices;
  filename?: string | (() => string);
  /** Longest output edge in pixels. Defaults to 2048. */
  maximumCanvasSize?: number;
}

const DEFAULT_MAXIMUM_CANVAS_SIZE = 2048;

function resolveMaximumCanvasSize(value: number | undefined): number {
  const maximumCanvasSize = value ?? DEFAULT_MAXIMUM_CANVAS_SIZE;
  if (!Number.isFinite(maximumCanvasSize) || maximumCanvasSize < 1) {
    throw new TypeError(
      "maximumCanvasSize must be a finite number greater than or equal to 1.",
    );
  }
  return Math.max(1, Math.floor(maximumCanvasSize));
}

function boundedDimensions(
  width: number,
  height: number,
  maximumCanvasSize: number,
): { width: number; height: number } {
  const scale = Math.min(1, maximumCanvasSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function timestampedFilename(): string {
  return `bug-report-screen-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas encoding returned no image."));
    }, "image/png");
  });
}

interface MetadataWait {
  promise: Promise<void>;
  cancel(): void;
}

function waitForVideoMetadata(
  video: HTMLVideoElement,
  timeoutMs = 5_000,
): MetadataWait {
  if (
    video.readyState >= HTMLMediaElement.HAVE_METADATA ||
    (video.videoWidth > 0 && video.videoHeight > 0)
  ) {
    return { promise: Promise.resolve(), cancel() {} };
  }

  let cancel = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("error", handleError);
      if (error) reject(error);
      else resolve();
    };
    const handleMetadata = () => finish();
    const handleError = () =>
      finish(video.error ?? new Error("The shared screen could not be read."));
    const timeoutId = setTimeout(
      () => finish(new Error("Timed out while reading the shared screen.")),
      timeoutMs,
    );

    video.addEventListener("loadedmetadata", handleMetadata, { once: true });
    video.addEventListener("error", handleError, { once: true });
    cancel = () => finish();
  });

  return { promise, cancel: () => cancel() };
}

export function createDisplayMediaCapture(
  options: DisplayMediaCaptureOptions = {},
): ScreenshotCaptureProvider {
  const maximumCanvasSize = resolveMaximumCanvasSize(
    options.maximumCanvasSize,
  );
  const getMediaDevices = (): MediaDevices | undefined =>
    options.mediaDevices ??
    (typeof navigator === "undefined" ? undefined : navigator.mediaDevices);

  return {
    isSupported() {
      return typeof getMediaDevices()?.getDisplayMedia === "function";
    },

    async capture() {
      const mediaDevices = getMediaDevices();
      if (typeof mediaDevices?.getDisplayMedia !== "function") {
        throw new ScreenshotCaptureError(
          "Screen capture is unavailable in this browser.",
        );
      }

      let stream: MediaStream | undefined;
      try {
        stream = await mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        // Register the metadata listener before playback. Some browsers deliver
        // `loadedmetadata` while `play()` is resolving, so listening afterward
        // can miss the event and leave capture pending indefinitely.
        const metadataWait = waitForVideoMetadata(video);
        try {
          await Promise.all([metadataWait.promise, video.play()]);
        } finally {
          metadataWait.cancel();
        }
        if (!video.videoWidth || !video.videoHeight) {
          throw new Error("The shared screen did not provide a video frame.");
        }

        const dimensions = boundedDimensions(
          video.videoWidth,
          video.videoHeight,
          maximumCanvasSize,
        );
        const canvas = document.createElement("canvas");
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");
        context.drawImage(video, 0, 0, dimensions.width, dimensions.height);
        const blob = await canvasToBlob(canvas);
        const filename =
          typeof options.filename === "function"
            ? options.filename()
            : (options.filename ?? timestampedFilename());
        return createScreenshotAttachment(blob, {
          filename,
          source: "capture",
          width: canvas.width,
          height: canvas.height,
        });
      } catch (cause) {
        if (
          cause instanceof BugReportValidationError ||
          cause instanceof ScreenshotCaptureError
        ) {
          throw cause;
        }
        throw new ScreenshotCaptureError(
          "The screen could not be captured. It may have been cancelled or blocked.",
          cause,
        );
      } finally {
        stream?.getTracks().forEach((track) => track.stop());
      }
    },
  };
}

export type { ScreenshotCaptureProvider } from "./types.js";
export { ScreenshotCaptureError } from "./types.js";
