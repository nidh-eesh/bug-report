# react-bug-report

[![npm version](https://img.shields.io/npm/v/react-bug-report.svg)](https://www.npmjs.com/package/react-bug-report)
[![license](https://img.shields.io/npm/l/react-bug-report.svg)](./LICENSE)
[![types](https://img.shields.io/npm/types/react-bug-report.svg)](https://www.typescriptlang.org/)

An accessible, themeable React bug-report form, dialog, and floating widget with anonymous reporting, optional screenshots, and provider-neutral delivery.

The package initializes no analytics, Sentry, Session Replay, network request, or screenshot capture on its own. Your application chooses the transport, the capture method, and the data it supplies.

> **`0.x` status** — public APIs are tested and documented, but breaking changes may occur before `1.0.0` and will be called out in release notes.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Components](#components)
- [Delivery](#delivery)
- [Privacy and submitted data](#privacy-and-submitted-data)
- [Screenshots](#screenshots)
- [Theming and copy](#theming-and-copy)
- [API reference](#api-reference)
- [Accessibility](#accessibility)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

- Floating widget, controlled dialog, and standalone form components
- Responsive desktop dialog and mobile bottom sheet with safe-area positioning
- Anonymous mode that omits name and email without changing the rest of the report
- Session-aware name and email prefilling
- Optional screenshot upload, DOM capture, display capture, or a custom provider
- Built-in HTTP and Sentry adapters plus a provider-neutral callback
- Light, dark, and system themes; semantic color, copy, and font overrides
- Keyboard and screen-reader support, visible focus, reduced motion, forced-colors handling
- ESM and CommonJS builds with TypeScript declarations
- No bundled fonts or Sentry SDK; the DOM screenshot dependency is optional

## Requirements

- React 18.2 or 19, and React DOM 18.2 or 19
- A browser with native `<dialog>` support for `BugReportDialog` and `BugReportWidget`
- `modern-screenshot` 4.7 or newer, only when using the DOM capture adapter

The visual components require React. Framework-free HTML applications need a separate DOM or web-component wrapper.

## Installation

```sh
npm install react-bug-report react react-dom
```

Import the stylesheet once near your application root:

```ts
import "react-bug-report/style.css";
```

For DOM screenshot capture, also install the optional peer:

```sh
npm install modern-screenshot
```

## Quick start

The floating widget is the shortest integration. In Next.js App Router, render it from a Client Component because it uses browser APIs and React state.

```tsx
"use client";

import { BugReportWidget } from "react-bug-report";
import { createHttpTransport } from "react-bug-report/transports/http";
import "react-bug-report/style.css";

const submitBugReport = createHttpTransport({
  endpoint: "/v1/bug-reports",
});

export function SupportWidget({ session }: { session: AppSession | null }) {
  return (
    <BugReportWidget
      onSubmit={submitBugReport}
      reporter={{
        name: session?.user?.name ?? "",
        email: session?.user?.email ?? "",
      }}
      theme="auto"
    />
  );
}
```

`reporter` updates are applied when session data arrives later, provided the reporter has not already edited that field.

## Components

### Floating widget

`BugReportWidget` owns its open state and renders a fixed trigger plus the dialog.

```tsx
<BugReportWidget
  onSubmit={submitBugReport}
  position="bottom-right"
  triggerLabel="Report a bug"
/>
```

Positions are `bottom-right`, `bottom-left`, `top-right`, and `top-left`. The trigger uses mobile safe-area insets and stays fixed while content scrolls.

### Controlled dialog

Use `BugReportDialog` when the host owns the trigger and open state.

```tsx
import { useState } from "react";
import { BugReportDialog } from "react-bug-report";

export function FeedbackAction() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Report a bug
      </button>
      <BugReportDialog
        onOpenChange={setOpen}
        onSubmit={submitBugReport}
        open={open}
      />
    </>
  );
}
```

### Standalone form

Use `BugReportForm` inside an existing panel, drawer, route, or settings screen.

```tsx
import { BugReportForm } from "react-bug-report";

<BugReportForm
  defaultExpanded
  onSubmit={submitBugReport}
  reporter={{ name: "Ada Lovelace", email: "ada@example.com" }}
/>;
```

## Delivery

`onSubmit` receives a validated `BugReport` and may return a receipt synchronously or asynchronously. A thrown or rejected error keeps the report editable and shows the failure state.

### HTTP transport

```tsx
import { createHttpTransport } from "react-bug-report/transports/http";

const submitBugReport = createHttpTransport({
  endpoint: "https://support.example.com/v1/bug-reports",
  credentials: "include",
  headers: async () => ({
    Authorization: `Bearer ${await getShortLivedToken()}`,
  }),
  timeoutMs: 30_000,
});
```

The adapter sends `multipart/form-data` with:

- `report` — an `application/json` file containing the versioned report and attachment metadata
- `attachment` — the optional PNG, JPEG, or WebP bytes

A successful JSON response must contain a non-empty `id` and an RFC 3339 `acceptedAt`. A `204 No Content` response is also accepted. The timeout covers asynchronous headers, the request, and response parsing, and composes with an optional caller `signal`.

Failures throw `BugReportTransportError` with `code`, `status`, `retryable`, `retryAfterMs`, and `cause`. Codes are `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `SERVER_ERROR`, `NETWORK_ERROR`, `INVALID_RESPONSE`, and `UNKNOWN`.

See [`openapi.yaml`](./openapi.yaml) for the server contract, which leaves authentication, abuse prevention, storage, and retention to the receiving application.

### Sentry transport

The adapter accepts the host SDK's `sendFeedback` function, so this package neither installs nor bundles a Sentry SDK.

```tsx
import * as Sentry from "@sentry/nextjs";
import { createSentryTransport } from "react-bug-report/transports/sentry";

const submitBugReport = createSentryTransport({
  sendFeedback: Sentry.sendFeedback,
  includeReplay: true,
  source: "customer-dashboard",
  tags: { product: "dashboard" },
});
```

The adapter:

- maps contact name and email only when the report is not anonymous
- appends steps, expected behavior, and actual behavior to the feedback message
- forwards the report URL and tags
- adds severity when the reporter explicitly selected it
- adds the package report ID as the searchable `bug_report_id` tag
- forwards timestamps and opted-in technical context through `captureContext.extra`
- sends a screenshot as a Sentry attachment
- returns Sentry's event ID when `sendFeedback` provides one

The package report ID is not passed as `associatedEventId`; it is not a Sentry error-event ID. `includeReplay` only asks the host SDK to associate an available replay. Canvas replay belongs in your own `Sentry.init` configuration and carries its own performance, compatibility, and privacy implications.

### Any other provider

No adapter is required. Send the normalized report to any SDK, server action, queue, or support platform:

```tsx
import type { BugReport } from "react-bug-report";

async function sendToMyProvider(report: BugReport) {
  const ticket = await mySupportSdk.createTicket({
    subject: report.message.slice(0, 80),
    body: report,
    image: report.attachment?.blob,
  });

  return { id: ticket.id, provider: "my-support-sdk" };
}

<BugReportForm onSubmit={sendToMyProvider} />;
```

If your transport accepts plain JSON, call `serializeBugReport(report)` to replace the attachment `Blob` with metadata, then send the bytes separately.

## Privacy and submitted data

Name and email are prefilled from `reporter` and remain editable. Enabling anonymous mode hides those two fields and guarantees `createBugReport` omits `contact`. Disabling it restores the locally held values. Anonymous mode does not alter the message, detailed fields, screenshot, report ID, timestamp, or technical context, and performs no additional scrubbing.

Technical context defaults off. When selected, the form can include:

- `window.location.href`
- viewport width and height, and device pixel ratio
- `navigator.userAgent` and `navigator.language`
- host-provided URL, application version, tags, and extra values

The `context` function is evaluated only after local fields pass validation and only when technical context is enabled. Set `collectBrowserContext={false}` to send only host-provided context. Avoid supplying secrets, access tokens, or sensitive URL query and hash values.

`redactBugReport(report)` removes both `contact` and `context`. The form and built-in transports never call it automatically.

Every report otherwise contains schema version `1`, a client-generated ID, an ISO submission timestamp, anonymous and technical-context flags, the trimmed message, non-empty optional details, and any optional contact, context, and screenshot data.

## Screenshots

The form accepts one PNG, JPEG, or WebP screenshot. The default maximum is 10 MiB; `maxAttachmentBytes` can lower, but not raise, that ceiling. Collapsing the detail fields does not hide an attached screenshot: its preview, filename, size, and remove action stay visible.

### File upload

The built-in picker deliberately omits the HTML `capture` attribute. On mobile this lets the reporter select an existing operating-system screenshot from Photos or Gallery, which is the reliable way to attach the real screen, including content outside the web page.

Set `allowScreenshotUpload={false}` to remove file upload. Capture actions appear only when a supplied provider reports support.

### DOM capture with `modern-screenshot`

```tsx
import { createModernScreenshotCapture } from "react-bug-report/capture/modern-screenshot";

const capture = createModernScreenshotCapture({
  target: () => document.documentElement,
  exclude: ["[data-private]"],
  backgroundColor: "#ffffff",
  maxScale: 2,
  maximumCanvasSize: 4096,
});

<BugReportWidget capture={capture} onSubmit={submitBugReport} />;
```

This captures a PNG of the current DOM viewport. The widget excludes itself through `data-bug-report-exclude`; add that attribute or an `exclude` selector to omit other elements. The adapter restores nested scroll positions, caps pixel ratio at 2, and caps the longest canvas edge at 4096 pixels by default.

This is not an operating-system screenshot. Cross-origin images and fonts need CORS access. Protected canvas/WebGL content, browser chrome, cross-origin frames, DRM content, and some videos may be blank or incomplete, so file upload remains the dependable fallback.

### Display capture

```tsx
import { createDisplayMediaCapture } from "react-bug-report/capture/display-media";

const capture = createDisplayMediaCapture({ maximumCanvasSize: 2048 });
```

The adapter uses `navigator.mediaDevices.getDisplayMedia`, captures one shared frame, stops every media track, and downsizes the longest edge before allocating its canvas. Browsers require a user gesture and show their own picker. `BugReportForm` silently ignores cancellation; other failures appear beside the screenshot actions.

Display capture is usually unavailable on mobile browsers and requires a secure context outside development exceptions such as localhost.

### Custom capture provider

```tsx
import {
  createScreenshotAttachment,
  type ScreenshotCaptureProvider,
} from "react-bug-report";

function createNativeCapture(
  isSupported: () => boolean,
  captureScreen: () => Promise<Blob>,
): ScreenshotCaptureProvider {
  return {
    isSupported,
    async capture() {
      const blob = await captureScreen();
      return createScreenshotAttachment(blob, {
        filename: "screen.png",
        source: "capture",
      });
    },
  };
}
```

Capture failures surface as `ScreenshotCaptureError`; attachment validation may instead throw `BugReportValidationError`. `ScreenshotCaptureError` is available from the package root and both capture entry points, and preserves `instanceof` identity across them.

## Theming and copy

The component inherits the host font, bundles no font files, and makes no font-network requests.

```tsx
<BugReportWidget
  accentColor="#6557d2"
  primaryColor="#171421"
  colors={{
    surface: "#fffdf8",
    field: "#f8f4eb",
    text: "#211f1a",
    onPrimary: "#ffffff",
  }}
  copy={{ title: "Tell us what broke", send: "Send to support" }}
  fontFamily="Inter, system-ui, sans-serif"
  onSubmit={sendReport}
  theme="light"
/>
```

`theme` accepts `light`, `dark`, or `auto` (which follows `prefers-color-scheme`). `colors` accepts `surface`, `field`, `fieldFocus`, `text`, `muted`, `label`, `border`, `divider`, `accent`, `primary`, `onPrimary`, `danger`, and `success`. `accentColor` and `primaryColor` are applied after `colors`.

`copy` is a partial override of `DEFAULT_BUG_REPORT_COPY`. `fontFamily` and `monoFontFamily` must refer to fonts the host has already loaded.

For lower-level styling, override the scoped `--nbr-*` custom properties, or pass `className`/`style` to `BugReportForm`, `dialogClassName` to `BugReportDialog`, and `triggerClassName`/`triggerStyle` to `BugReportWidget`. Host CSS is not reset globally.

## API reference

### `BugReportForm`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onSubmit` | `BugReportSubmit` | required | Sends the validated report. |
| `reporter` | `{ name?: string; email?: string }` | — | Prefills contact fields and accepts late session updates. |
| `context` | `BugReportContext \| () => BugReportContext \| Promise<BugReportContext>` | — | Host context resolved only for an opted-in, locally valid submission. |
| `capture` | `ScreenshotCaptureProvider` | — | Adds a capture action when `isSupported()` returns true. |
| `theme` | `"light" \| "dark" \| "auto"` | `"light"` | Selects the color theme. |
| `colors` | `Partial<BugReportColors>` | — | Overrides semantic colors. |
| `accentColor` | `string` | — | Overrides the accent color. |
| `primaryColor` | `string` | — | Overrides primary buttons and the widget trigger. |
| `fontFamily` | `string` | inherited | Sets the component font stack. |
| `monoFontFamily` | `string` | inherited | Sets compact attachment-metadata text. |
| `copy` | `Partial<BugReportCopy>` | built-in English | Overrides labels, errors, and success copy. |
| `defaultAnonymous` | `boolean` | `false` | Sets the initial anonymous state. |
| `defaultExpanded` | `boolean` | `false` | Initially displays the optional details. |
| `defaultIncludeTechnicalContext` | `boolean` | `false` | Sets initial technical-context consent. |
| `collectBrowserContext` | `boolean` | `true` | Adds browser context only when technical context is selected. |
| `allowScreenshotUpload` | `boolean` | `true` | Enables the file picker. |
| `maxAttachmentBytes` | `number` | `10 * 1024 * 1024` | Lowers the screenshot-size limit. |
| `className` | `string` | — | Adds a class to the form root. |
| `style` | `CSSProperties` | — | Adds inline styles and may override `--nbr-*` variables. |
| `onAnonymousChange` | `(anonymous: boolean) => void` | — | Observes anonymous-state changes. |
| `onSuccess` | `(receipt, report) => void` | — | Runs after successful delivery; callback failures go to `onError`. |
| `onError` | `(error: unknown) => void` | — | Observes transport, context, and callback failures. |

### `BugReportDialog`

Accepts every `BugReportForm` prop, plus:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | required | Controls the native dialog. |
| `onOpenChange` | `(open: boolean) => void` | required | Receives close requests. |
| `closeLabel` | `string` | `"Close bug report"` | Accessible label for the close button. |
| `dialogClassName` | `string` | — | Adds a class to the dialog element. |

### `BugReportWidget`

Accepts every `BugReportForm` prop, plus:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `defaultOpen` | `boolean` | `false` | Sets the initial uncontrolled open state. |
| `onOpenChange` | `(open: boolean) => void` | — | Observes open-state changes. |
| `triggerLabel` | `string` | `"Report a bug"` | Sets visible and accessible trigger text. |
| `position` | `BugReportWidgetPosition` | `"bottom-right"` | Places the fixed trigger. |
| `triggerClassName` | `string` | — | Adds a class to the trigger. |
| `triggerStyle` | `CSSProperties` | — | Adds inline trigger styles. |

### Capture adapters

`createModernScreenshotCapture(options)` accepts `target`, `domToBlob`, `exclude`, `filename`, `backgroundColor`, `maximumCanvasSize`, and `maxScale`. `createDisplayMediaCapture(options)` accepts `mediaDevices`, `filename`, and `maximumCanvasSize`.

The injectable `domToBlob`, `mediaDevices`, and filename functions are useful for native bridges and tests. Most applications should use the defaults.

### Core utilities

| Export | Purpose |
| --- | --- |
| `createBugReport` | Validates, trims, normalizes, IDs, and timestamps a report. |
| `validateBugReportInput` | Throws `BugReportValidationError` with structured `issues`. |
| `createScreenshotAttachment` | Validates and normalizes a screenshot `Blob`. |
| `serializeBugReport` | Produces JSON-safe report data and attachment metadata. |
| `redactBugReport` | Removes contact and technical context. |
| `formatBytes` | Formats a byte limit without overstating it. |
| `BUG_REPORT_SCHEMA_VERSION` | Current serialized report schema version. |
| `BUG_REPORT_SEVERITIES` | Supported severity values. |

### Entry points

| Import | Contents |
| --- | --- |
| `react-bug-report` | React components, core types/utilities, and public errors. |
| `react-bug-report/core` | Provider-neutral data model and utilities, without React. |
| `react-bug-report/transports/http` | Multipart HTTP adapter. |
| `react-bug-report/transports/sentry` | Structurally typed Sentry adapter. |
| `react-bug-report/capture/display-media` | Dependency-free display-sharing capture. |
| `react-bug-report/capture/modern-screenshot` | Optional DOM capture adapter. |
| `react-bug-report/style.css` | Complete component stylesheet. |

## Accessibility

The package uses native controls and a native modal `<dialog>`, exposes switch and combobox semantics, associates validation messages with fields, keeps success announcements in a persistent live region, moves focus to the success heading, and retains visible focus styling. Escape, the close button, and a true backdrop click close the dialog; dragging a text selection onto the backdrop does not discard the draft.

On screens up to 600 pixels wide the dialog becomes a bottom sheet, inputs use a 16-pixel font to avoid unwanted mobile zoom, actions grow to touch-friendly sizes, and safe-area insets are respected. Motion is reduced under `prefers-reduced-motion`, and important controls retain borders in forced-colors mode.

The release gate exercises desktop Chromium, desktop Firefox, and mobile Chromium. WebKit and iPhone-sized emulation are available through the extended local matrix.

## Troubleshooting

**The component is unstyled.** Import `react-bug-report/style.css` once. If your bundler tree-shakes CSS, ensure CSS side effects are enabled; the package marks its stylesheet as a side effect.

**The widget is hidden behind application UI.** The trigger uses a high fixed `z-index`, but transformed ancestors, native top-layer elements, and application overlays can still affect composition. Render the widget near the application root and inspect custom `triggerStyle` or host CSS.

**"Capture this page" is missing.** The action renders only when the supplied provider's `isSupported()` returns true. Install `modern-screenshot` for the DOM adapter; for display capture, use a supported desktop browser in a secure context.

**A DOM screenshot is blank or incomplete.** Check cross-origin image and font headers, canvas or WebGL restrictions, cross-origin frames, and the selected target. Offer file upload as the fallback.

**HTTP reports fail with `INVALID_RESPONSE`.** Return `204`, or JSON with at least a non-empty `id` and RFC 3339 `acceptedAt`:

```json
{
  "id": "report_123",
  "acceptedAt": "2026-08-13T12:00:00.000Z",
  "provider": "internal"
}
```

**Sentry reports are not appearing.** Initialize the Sentry browser SDK in the host application, verify its public DSN is available in the browser build, and pass that SDK's `sendFeedback`.

## Development

```sh
git clone https://github.com/nidh-eesh/react-bug-report.git
cd react-bug-report
npm install
npm run demo
```

The demo runs at `http://127.0.0.1:4178`.

| Command | Purpose |
| --- | --- |
| `npm run demo` | Starts the local Vite demo. |
| `npm run typecheck` | Runs TypeScript without emitting files. |
| `npm test` | Runs the unit and accessibility suite. |
| `npm run test:coverage` | Runs tests with enforced coverage thresholds. |
| `npm run lint:api` | Validates the OpenAPI contract. |
| `npm run build` | Builds ESM, CommonJS, CSS, source maps, and declarations. |
| `npm run test:e2e` | Runs the Chromium/Firefox browser gate. |
| `npm run test:e2e:all` | Runs every configured Playwright project. |
| `npm run check:pack` | Prints the npm tarball contents without publishing. |
| `npm run verify` | Runs typecheck, coverage, API lint, and build. |

Install browsers when needed with `npx playwright install chromium firefox`.

## Contributing

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and expectations.

## Security

Client validation is a usability boundary, not a security boundary. The receiving server must independently enforce authentication, size limits, rate limiting, image validation, authorization, retention, and output encoding — see [`openapi.yaml`](./openapi.yaml). Do not ship long-lived provider secrets in browser-side headers; use short-lived authorization or a same-origin backend.

To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © 2026 nidh-eesh
