import { createScreenshotAttachment } from "../core.js";
import {
  ScreenshotCaptureError,
  type ScreenshotCaptureProvider,
} from "./types.js";

export interface DomToBlobOptions {
  width?: number;
  height?: number;
  scale?: number;
  maximumCanvasSize?: number;
  filter?: (node: Node) => boolean;
  backgroundColor?: string;
  style?: Partial<CSSStyleDeclaration>;
  features?: { restoreScrollPosition?: boolean };
}

export type DomToBlob = (
  node: Node,
  options?: DomToBlobOptions,
) => Promise<Blob>;

export interface ModernScreenshotCaptureOptions {
  target?: Node | (() => Node | null);
  domToBlob?: DomToBlob;
  exclude?: readonly string[];
  filename?: string | (() => string);
  backgroundColor?: string;
  maximumCanvasSize?: number;
  maxScale?: number;
}

function timestampedFilename(): string {
  return `bug-report-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
}

function resolveTarget(
  target: ModernScreenshotCaptureOptions["target"],
): Node | null {
  if (typeof target === "function") return target();
  if (target) return target;
  return typeof document === "undefined" ? null : document.documentElement;
}

function matchesAny(element: Element, selectors: readonly string[]): boolean {
  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

function renderedDimensions(
  width: number,
  height: number,
  scale: number,
  maximumCanvasSize: number,
): { width: number; height: number } {
  // modern-screenshot allocates the canvas from scaled CSS dimensions, then
  // proportionally clamps the longest edge. Keep attachment metadata aligned
  // with those actual PNG pixel dimensions rather than the CSS viewport.
  let renderedWidth = Math.max(1, Math.floor(width * scale));
  let renderedHeight = Math.max(1, Math.floor(height * scale));
  const maximum = Number.isFinite(maximumCanvasSize)
    ? Math.floor(maximumCanvasSize)
    : 0;

  if (
    maximum > 0 &&
    (renderedWidth > maximum || renderedHeight > maximum)
  ) {
    if (renderedWidth > renderedHeight) {
      renderedHeight = Math.max(
        1,
        Math.floor((renderedHeight * maximum) / renderedWidth),
      );
      renderedWidth = maximum;
    } else {
      renderedWidth = Math.max(
        1,
        Math.floor((renderedWidth * maximum) / renderedHeight),
      );
      renderedHeight = maximum;
    }
  }

  return { width: renderedWidth, height: renderedHeight };
}

export function createModernScreenshotCapture(
  options: ModernScreenshotCaptureOptions = {},
): ScreenshotCaptureProvider {
  return {
    isSupported() {
      return (
        typeof window !== "undefined" &&
        typeof document !== "undefined" &&
        resolveTarget(options.target) !== null
      );
    },

    async capture() {
      const target = resolveTarget(options.target);
      if (!target || typeof window === "undefined") {
        throw new ScreenshotCaptureError(
          "DOM screenshot capture is unavailable in this environment.",
        );
      }

      const width = Math.max(1, Math.round(window.innerWidth));
      const height = Math.max(1, Math.round(window.innerHeight));
      const scale = Math.max(
        1,
        Math.min(window.devicePixelRatio || 1, options.maxScale ?? 2),
      );
      const maximumCanvasSize = options.maximumCanvasSize ?? 4096;
      const dimensions = renderedDimensions(
        width,
        height,
        scale,
        maximumCanvasSize,
      );
      const excludedSelectors = [
        "[data-bug-report-exclude]",
        ...(options.exclude ?? []),
      ];

      try {
        const domToBlob =
          options.domToBlob ??
          ((await import("modern-screenshot")).domToBlob as DomToBlob);
        const blob = await domToBlob(target, {
          width,
          height,
          scale,
          maximumCanvasSize,
          filter: (node) =>
            !(node instanceof Element) || !matchesAny(node, excludedSelectors),
          features: { restoreScrollPosition: true },
          style: {
            transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
            transformOrigin: "top left",
          },
          ...(options.backgroundColor
            ? { backgroundColor: options.backgroundColor }
            : {}),
        });
        const filename =
          typeof options.filename === "function"
            ? options.filename()
            : (options.filename ?? timestampedFilename());
        return createScreenshotAttachment(blob, {
          filename,
          source: "capture",
          width: dimensions.width,
          height: dimensions.height,
        });
      } catch (cause) {
        if (cause instanceof ScreenshotCaptureError) throw cause;
        throw new ScreenshotCaptureError(
          "The visible page could not be captured.",
          cause,
        );
      }
    },
  };
}

export type { ScreenshotCaptureProvider } from "./types.js";
export { ScreenshotCaptureError } from "./types.js";
