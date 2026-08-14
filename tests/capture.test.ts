import { describe, expect, it, vi } from "vitest";

import {
  BugReportTransportError as CoreBugReportTransportError,
  BugReportValidationError,
} from "../src/core";
import {
  createDisplayMediaCapture,
  ScreenshotCaptureError as DisplayMediaScreenshotCaptureError,
} from "../src/capture/display-media";
import {
  createModernScreenshotCapture,
  ScreenshotCaptureError as ModernScreenshotCaptureError,
} from "../src/capture/modern-screenshot";
import { ScreenshotCaptureError } from "../src/capture/types";
import {
  BugReportTransportError as RootBugReportTransportError,
  BugReportValidationError as RootBugReportValidationError,
  ScreenshotCaptureError as RootScreenshotCaptureError,
} from "../src/index";

describe("capture error exports", () => {
  it("exports the runtime error from the root and both capture entry points", () => {
    expect(RootScreenshotCaptureError).toBe(ScreenshotCaptureError);
    expect(DisplayMediaScreenshotCaptureError).toBe(ScreenshotCaptureError);
    expect(ModernScreenshotCaptureError).toBe(ScreenshotCaptureError);
    expect(RootBugReportValidationError).toBe(BugReportValidationError);
    expect(RootBugReportTransportError).toBe(CoreBugReportTransportError);
  });
});

describe("modern-screenshot capture adapter", () => {
  it("captures only the current viewport at a bounded pixel ratio", async () => {
    const domToBlob = vi.fn(
      async () => new Blob(["png"], { type: "image/png" }),
    );
    const root = document.createElement("main");
    document.body.append(root);
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 3,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    const capture = createModernScreenshotCapture({
      domToBlob,
      target: root,
    });

    const result = await capture.capture();

    expect(result).toMatchObject({
      filename: expect.stringMatching(/^bug-report-.*\.png$/),
      height: 1688,
      source: "capture",
      width: 780,
    });
    expect(domToBlob).toHaveBeenCalledWith(
      root,
      expect.objectContaining({
        height: 844,
        maximumCanvasSize: 4096,
        scale: 2,
        width: 390,
      }),
    );
  });

  it("reports scaled dimensions after the maximum canvas size clamps them", async () => {
    const domToBlob = vi.fn(
      async () => new Blob(["png"], { type: "image/png" }),
    );
    const root = document.createElement("main");
    document.body.append(root);
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 3_000,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 2_000,
    });

    const capture = createModernScreenshotCapture({
      domToBlob,
      maximumCanvasSize: 4_096,
      target: root,
    });

    await expect(capture.capture()).resolves.toMatchObject({
      height: 2_730,
      width: 4_096,
    });
  });

  it("excludes the bug-report UI and host-selected nodes", async () => {
    let suppliedFilter: ((node: Node) => boolean) | undefined;
    const capture = createModernScreenshotCapture({
      domToBlob: vi.fn(async (_node, options) => {
        suppliedFilter = options?.filter;
        return new Blob(["png"], { type: "image/png" });
      }),
      exclude: ["[data-private]"],
      target: document.body,
    });
    const widget = document.createElement("div");
    widget.dataset.bugReportExclude = "";
    const privateNode = document.createElement("div");
    privateNode.dataset.private = "";
    const normalNode = document.createElement("div");

    await capture.capture();

    expect(suppliedFilter?.(widget)).toBe(false);
    expect(suppliedFilter?.(privateNode)).toBe(false);
    expect(suppliedFilter?.(normalNode)).toBe(true);
  });

  it("supports custom capture options and wraps renderer failures", async () => {
    const renderer = vi.fn(
      async () => new Blob(["png"], { type: "image/png" }),
    );
    const capture = createModernScreenshotCapture({
      backgroundColor: "#fff",
      domToBlob: renderer,
      exclude: ["["],
      filename: () => "custom.png",
      maxScale: 1.5,
      maximumCanvasSize: 2048,
      target: () => document.body,
    });

    await expect(capture.capture()).resolves.toMatchObject({
      filename: "custom.png",
      source: "capture",
    });
    expect(renderer).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({
        backgroundColor: "#fff",
        maximumCanvasSize: 2048,
        scale: 1.5,
        features: { restoreScrollPosition: true },
      }),
    );

    const failing = createModernScreenshotCapture({
      domToBlob: vi.fn(async () => {
        throw new Error("tainted canvas");
      }),
      target: document.body,
    });
    await expect(failing.capture()).rejects.toBeInstanceOf(
      ScreenshotCaptureError,
    );
  });

  it("reports a missing target as unsupported", async () => {
    const capture = createModernScreenshotCapture({ target: () => null });
    expect(capture.isSupported()).toBe(false);
    await expect(capture.capture()).rejects.toThrow(
      "DOM screenshot capture is unavailable",
    );
  });
});

describe("display-media capture adapter", () => {
  it("reports unsupported instead of presenting a broken mobile action", () => {
    const capture = createDisplayMediaCapture({
      mediaDevices: {} as MediaDevices,
    });

    expect(capture.isSupported()).toBe(false);
  });

  it("declares that the host UI must be hidden before the frame is taken", () => {
    const capture = createDisplayMediaCapture({
      mediaDevices: {} as MediaDevices,
    });

    expect(capture.requiresHiddenUi).toBe(true);
  });

  it("lets the host narrow support beyond the browser capability probe", () => {
    const capture = createDisplayMediaCapture({
      isSupported: () => false,
      mediaDevices: { getDisplayMedia: vi.fn() } as unknown as MediaDevices,
    });

    expect(capture.isSupported()).toBe(false);
  });

  it("keeps a host support override from claiming an unavailable API", () => {
    const capture = createDisplayMediaCapture({
      isSupported: () => true,
      mediaDevices: {} as MediaDevices,
    });

    expect(capture.isSupported()).toBe(false);
  });

  it("forwards host display-media constraints to the browser", async () => {
    const getDisplayMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: vi.fn() }],
    }));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      value: 360,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["png"], { type: "image/png" })),
    );
    const capture = createDisplayMediaCapture({
      displayMedia: {
        monitorTypeSurfaces: "exclude",
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        video: { width: 1280 },
      },
      mediaDevices: { getDisplayMedia } as unknown as MediaDevices,
    });

    await capture.capture();

    expect(getDisplayMedia).toHaveBeenCalledWith({
      audio: false,
      monitorTypeSurfaces: "exclude",
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      video: { width: 1280 },
    });
  });

  it("captures one video frame and always stops the display stream", async () => {
    const stop = vi.fn();
    const getDisplayMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      value: 360,
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["png"], { type: "image/png" })),
    );
    const capture = createDisplayMediaCapture({
      filename: () => "shared-screen.png",
      mediaDevices: { getDisplayMedia } as unknown as MediaDevices,
    });

    expect(capture.isSupported()).toBe(true);
    await expect(capture.capture()).resolves.toMatchObject({
      filename: "shared-screen.png",
      height: 360,
      width: 640,
    });
    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true });
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(HTMLVideoElement),
      0,
      0,
      640,
      360,
    );
    expect(stop).toHaveBeenCalledOnce();
  });

  it.each([
    ["the default bound", 3840, 2160, undefined, 2048, 1152],
    ["a configured bound", 7680, 4320, 1024, 1024, 576],
  ] as const)(
    "downscales large shared displays before allocating the canvas using %s",
    async (
      _description,
      sourceWidth,
      sourceHeight,
      maximumCanvasSize,
      expectedWidth,
      expectedHeight,
    ) => {
      const stop = vi.fn();
      const getDisplayMedia = vi.fn(async () => ({
        getTracks: () => [{ stop }],
      }));
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
        configurable: true,
        value: sourceWidth,
      });
      Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
        configurable: true,
        value: sourceHeight,
      });
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        drawImage,
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        (callback) => callback(new Blob(["png"], { type: "image/png" })),
      );
      const capture = createDisplayMediaCapture({
        ...(maximumCanvasSize === undefined ? {} : { maximumCanvasSize }),
        mediaDevices: { getDisplayMedia } as unknown as MediaDevices,
      });

      await expect(capture.capture()).resolves.toMatchObject({
        height: expectedHeight,
        width: expectedWidth,
      });
      expect(drawImage).toHaveBeenCalledWith(
        expect.any(HTMLVideoElement),
        0,
        0,
        expectedWidth,
        expectedHeight,
      );
      expect(stop).toHaveBeenCalledOnce();
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid maximum canvas size of %s",
    (maximumCanvasSize) => {
      expect(() => createDisplayMediaCapture({ maximumCanvasSize })).toThrow(
        "maximumCanvasSize must be a finite number greater than or equal to 1",
      );
    },
  );

  it("listens for metadata before playback can deliver it", async () => {
    const stop = vi.fn();
    const getDisplayMedia = vi.fn(async () => ({
      getTracks: () => [{ stop }],
    }));
    let width = 0;
    let height = 0;
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => width,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => height,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      width = 390;
      height = 844;
      this.dispatchEvent(new Event("loadedmetadata"));
      return Promise.resolve();
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["png"], { type: "image/png" })),
    );
    const capture = createDisplayMediaCapture({
      mediaDevices: { getDisplayMedia } as unknown as MediaDevices,
    });

    await expect(capture.capture()).resolves.toMatchObject({
      height: 844,
      width: 390,
    });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("removes metadata listeners immediately when playback fails", async () => {
    vi.useFakeTimers();
    try {
      const stop = vi.fn();
      const getDisplayMedia = vi.fn(async () => ({
        getTracks: () => [{ stop }],
      }));
      Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
        configurable: true,
        value: 0,
      });
      Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
        configurable: true,
        value: 0,
      });
      vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
        new Error("playback failed"),
      );
      const removeEventListener = vi.spyOn(
        HTMLVideoElement.prototype,
        "removeEventListener",
      );
      const capture = createDisplayMediaCapture({
        mediaDevices: { getDisplayMedia } as unknown as MediaDevices,
      });

      await expect(capture.capture()).rejects.toThrow("could not be captured");

      expect(removeEventListener).toHaveBeenCalledWith(
        "loadedmetadata",
        expect.any(Function),
      );
      expect(removeEventListener).toHaveBeenCalledWith(
        "error",
        expect.any(Function),
      );
      expect(stop).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns cancellation and unsupported capture into useful errors", async () => {
    const unsupported = createDisplayMediaCapture({
      mediaDevices: {} as MediaDevices,
    });
    await expect(unsupported.capture()).rejects.toThrow(
      "Screen capture is unavailable",
    );

    for (const name of ["NotAllowedError", "AbortError"] as const) {
      const cancelled = createDisplayMediaCapture({
        mediaDevices: {
          getDisplayMedia: vi.fn(async () => {
            throw new DOMException("cancelled", name);
          }),
        } as unknown as MediaDevices,
      });
      await expect(cancelled.capture()).rejects.toThrow(
        "may have been cancelled or blocked",
      );
      await expect(cancelled.capture()).rejects.toMatchObject({
        cause: expect.objectContaining({ name }),
        name: "ScreenshotCaptureError",
      });
    }
  });

  it("preserves validation and capture errors from the underlying adapter", async () => {
    const validationError = new BugReportValidationError([
      {
        code: "invalid",
        field: "attachment",
        message: "invalid attachment",
      },
    ]);
    const getDisplayMedia = vi.fn(async () => {
      throw validationError;
    });
    const capture = createDisplayMediaCapture({
      mediaDevices: { getDisplayMedia } as unknown as MediaDevices,
    });

    await expect(capture.capture()).rejects.toBe(validationError);

    const original = new ScreenshotCaptureError("already normalized");
    const existingErrorCapture = createDisplayMediaCapture({
      mediaDevices: {
        getDisplayMedia: vi.fn(async () => {
          throw original;
        }),
      } as unknown as MediaDevices,
    });
    await expect(existingErrorCapture.capture()).rejects.toBe(original);
  });
});
