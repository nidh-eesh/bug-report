import { createScreenshotAttachment } from "../core.js";
import {
  ScreenshotCaptureError,
  type ScreenshotCaptureProvider,
} from "./types.js";

export interface DisplayMediaCaptureOptions {
  mediaDevices?: MediaDevices;
  filename?: string | (() => string);
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

function waitForVideoMetadata(
  video: HTMLVideoElement,
  timeoutMs = 5_000,
): Promise<void> {
  if (
    video.readyState >= HTMLMediaElement.HAVE_METADATA ||
    (video.videoWidth > 0 && video.videoHeight > 0)
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
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
  });
}

export function createDisplayMediaCapture(
  options: DisplayMediaCaptureOptions = {},
): ScreenshotCaptureProvider {
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
        const metadataReady = waitForVideoMetadata(video);
        await Promise.all([metadataReady, video.play()]);
        if (!video.videoWidth || !video.videoHeight) {
          throw new Error("The shared screen did not provide a video frame.");
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");
        context.drawImage(video, 0, 0);
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
