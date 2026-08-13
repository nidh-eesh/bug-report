# @nidh-eesh/bug-report

An accessible React bug-report form and floating dialog with configurable styling, anonymous reporting, screenshots, and provider-neutral delivery.

The package does not initialize analytics, Sentry, replay, network requests, or screenshot capture by itself. The host app supplies the submit function and opts into any capture provider it wants.

## Install

```sh
npm install @nidh-eesh/bug-report
```

React and React DOM are peer dependencies. `modern-screenshot` is optional and is needed only for its capture adapter.

JavaScript and TypeScript React applications can both use the package. Consumers run the published ESM or CommonJS JavaScript; the included TypeScript declarations only provide optional editor and compiler support. The visual components require React, so framework-free HTML/DOM applications would need a separate web-component or DOM adapter.

## Floating widget

```tsx
"use client";

import { BugReportWidget } from "@nidh-eesh/bug-report";
import { createHttpTransport } from "@nidh-eesh/bug-report/transports/http";
import "@nidh-eesh/bug-report/style.css";

const submitBugReport = createHttpTransport({
  endpoint: "/v1/bug-reports",
});

interface AppSession {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

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

The fixed trigger uses safe-area insets on mobile and can be placed at `bottom-right`, `bottom-left`, `top-right`, or `top-left`. `BugReportForm` and `BugReportDialog` are also exported for custom placement.

## Anonymous reports

Name and email are prefilled from `reporter` and remain editable. Turning on anonymous mode hides those two inputs and omits contact data from the submitted report. Turning it off restores the values. The message, detailed fields, screenshot, and opted-in technical context remain unchanged.

`redactBugReport(report)` is exported for applications that later choose to add a separate redaction policy. The component and built-in transports never call it automatically.

## Screenshots on desktop and mobile

Every expanded form has a normal image file input accepting PNG, JPEG, and WebP. It intentionally has no HTML `capture` attribute. On phones this allows the user to select an existing operating-system screenshot from Photos or Gallery, which is the dependable way to attach the real screen—including content outside the web page.

DOM capture is an optional enhancement:

```sh
npm install modern-screenshot
```

```tsx
import { createModernScreenshotCapture } from "@nidh-eesh/bug-report/capture/modern-screenshot";

const capture = createModernScreenshotCapture({
  target: () => document.documentElement,
  exclude: ["[data-private]"],
});

<BugReportWidget capture={capture} onSubmit={submitBugReport} />;
```

This adapter captures a PNG representation of the current DOM viewport, excludes elements marked `data-bug-report-exclude`, restores nested scroll positions, caps pixel ratio at 2, and caps canvas dimensions at 4096 pixels by default. It is not an operating-system screenshot. Cross-origin images/fonts need CORS access; protected canvas/WebGL, native browser UI, cross-origin frames, and some video content may be blank or incomplete.

For supported desktop browsers, a dependency-free display-sharing adapter is also available:

```tsx
import { createDisplayMediaCapture } from "@nidh-eesh/bug-report/capture/display-media";

const capture = createDisplayMediaCapture();
```

The action is shown only when `getDisplayMedia()` exists. Mobile browsers generally do not expose that API, so file selection remains the mobile baseline. Native shells can implement the small `ScreenshotCaptureProvider` interface and pass their own bridge.

## Sentry

The Sentry adapter uses structural dependency injection, so this package does not install or bundle a Sentry SDK:

```tsx
import * as Sentry from "@sentry/nextjs";
import { createSentryTransport } from "@nidh-eesh/bug-report/transports/sentry";

const submitBugReport = createSentryTransport({
  sendFeedback: Sentry.sendFeedback,
  includeReplay: true,
  tags: { product: "my-app" },
});

<BugReportWidget onSubmit={submitBugReport} />;
```

Screenshot blobs become Sentry event attachments. Replay inclusion is a host setting and is not described to the reporter by the UI.

Canvas replay is separate from feedback delivery and should stay in the host's Sentry client configuration:

```ts
import * as Sentry from "@sentry/nextjs";

export function createCanvasReplayIntegration() {
  return Sentry.replayCanvasIntegration({
    enableManualSnapshot: false,
  });
}

Sentry.init({
  integrations: [Sentry.replayIntegration(), createCanvasReplayIntegration()],
});
```

Canvas replay has additional performance and privacy implications; configure it independently from whether a user can file a report.

## Any other provider

`onSubmit` receives a normalized, validated `BugReport`. It can call any SDK or endpoint:

```tsx
import type { BugReport } from "@nidh-eesh/bug-report";

async function sendToMyProvider(report: BugReport) {
  await mySupportSdk.createTicket({
    subject: report.message.slice(0, 80),
    body: report,
    image: report.attachment?.blob,
  });

  return { id: "ticket-123", provider: "my-support-sdk" };
}

<BugReportForm onSubmit={sendToMyProvider} />;
```

The supplied HTTP transport uses `multipart/form-data` with:

- `report`: an `application/json` file containing the versioned report and attachment metadata;
- `attachment`: the optional image bytes.

See [`openapi.yaml`](./openapi.yaml) for the server contract.

## Theme and copy

The default light and dark themes preserve the component's colors, spacing, and motion while inheriting the host application's font. The package bundles no fonts and makes no font-network requests. Use `fontFamily` and `monoFontFamily` when the component should use explicitly loaded host fonts instead.

```tsx
<BugReportWidget
  accentColor="#6557d2"
  primaryColor="#171421"
  colors={{
    surface: "#fffdf8",
    field: "#f8f4eb",
    text: "#211f1a",
  }}
  fontFamily='Inter, system-ui, sans-serif'
  monoFontFamily='"JetBrains Mono", monospace'
  copy={{ title: "Tell us what broke" }}
  onSubmit={sendReport}
  theme="light"
/>
```

The package does not load the supplied fonts; the host application remains responsible for making them available. `monoFontFamily` is used only for compact attachment metadata and its remove action. When omitted, it falls back to `fontFamily`, then the inherited host font.

For complete control, override the scoped `--nbr-*` custom properties—including `--nbr-font-family` and `--nbr-mono-font-family`—or pass `className`/`style` to `BugReportForm`. Host CSS is not reset globally.

## Important props

| Prop                           | Purpose                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `onSubmit`                     | Required provider-neutral function.                                                        |
| `reporter`                     | Prefills name and email, including when session data arrives later.                        |
| `context`                      | Object or async function evaluated at submission time.                                     |
| `capture`                      | Optional screenshot provider. Unsupported actions stay hidden.                             |
| `theme`                        | `light`, `dark`, or `auto`.                                                                |
| `colors`                       | Partial semantic color map.                                                                |
| `accentColor` / `primaryColor` | Convenient brand overrides.                                                                |
| `fontFamily`                   | Optional component font stack; inherits the host application's font by default.            |
| `monoFontFamily`               | Optional attachment-metadata font stack; otherwise uses `fontFamily` or host inheritance.  |
| `defaultAnonymous`             | Initial anonymous state.                                                                   |
| `defaultExpanded`              | Initially show detailed fields.                                                            |
| `collectBrowserContext`        | Add URL, viewport, locale, and user agent when the technical-context checkbox is selected. |
| `copy`                         | Partial text override for localization or product voice.                                   |

## Security and server responsibilities

Client validation is a usability feature, not a trust boundary. The receiving server must enforce authentication or abuse controls, rate limits, body-size limits, image MIME/signature checks, safe object names, retention, and authorization for viewing reports. Do not render report text as HTML. Avoid placing long-lived secrets in browser-side transport headers.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox
npm run test:e2e
npm pack --dry-run
```

`test:e2e` runs the desktop Chromium, Pixel-sized Chromium, and desktop Firefox release gate. Run `npx playwright install --with-deps chromium firefox webkit` followed by `npm run test:e2e:all` for the complete desktop Chromium/Firefox/WebKit and Pixel/iPhone-sized matrix. The release entry point is `prepublishOnly`, which runs TypeScript 7 checks, unit/accessibility tests, API-contract validation, builds, the portable browser gate, and package-content inspection.

## License

Package source is MIT licensed. No fonts or third-party runtime libraries are bundled; React, React DOM, and optional `modern-screenshot` remain consumer-managed peer dependencies.
