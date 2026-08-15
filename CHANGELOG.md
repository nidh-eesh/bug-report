# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-08-15

### Fixed

- The Sentry transport no longer lets the SDK supply the page address for a report that carries no URL. `sendFeedback` derives `url` from the current location and lets caller params overwrite it, so omitting the key put the reporter's live path, query string, and fragment on the very reports that had opted out of sending them. The adapter now always states the field, as `undefined` when the report has no URL. A blank host-supplied `context.url` counts as absent rather than being forwarded as an empty string.

### Changed

- The Sentry adapter always supplies a capture context, so it passes the hint directly instead of testing whether one is present.
- Documented that Sentry attaches host-configured `Sentry.setUser()` identity to every event, anonymous reports included. That is the host's own SDK configuration; the adapter continues to withhold report contact fields for anonymous reports.

## [0.2.0] - 2026-08-14

Additive: nothing in 0.1.0 was removed or changed shape. The minor bump
reflects the new public API, and the behaviour changes noted below.

### Changed

- Default copy in `DEFAULT_BUG_REPORT_COPY` is plainer and more direct. Hosts that pass their own `copy` are unaffected, and every key keeps its name and meaning.

### Fixed

- Display capture no longer photographs the bug report itself. `createDisplayMediaCapture` now declares `requiresHiddenUi`, so the form, dialog, and widget trigger become invisible and wait for a paint before the frame is taken. Visibility is withdrawn rather than layout, so the reporter's draft, attachments, and scroll position are untouched. This is a change of default behaviour for existing callers of that adapter, which is why it ships in a minor rather than a patch.

### Added

- `ScreenshotCaptureProvider.requiresHiddenUi`, so any provider that photographs the composited screen (an Electron `desktopCapturer`, a native shell bridge) can opt into the same treatment. DOM adapters leave it unset because `data-bug-report-exclude` already covers them.
- `onCapturingChange` on `BugReportForm`, `BugReportDialog`, and `BugReportWidget`, so a host can hide its own fixed chrome for the same window.
- `displayMedia` on `createDisplayMediaCapture`, merging host constraints and browser hints such as `preferCurrentTab`, `selfBrowserSurface`, `monitorTypeSurfaces`, and `surfaceSwitching` into the `getDisplayMedia` request.
- `isSupported` on `createDisplayMediaCapture`, letting an application withdraw support on engines that expose `getDisplayMedia` and then reject every call. The override cannot claim an API the browser does not provide, and the package still does not sniff user agents.

## [0.1.0] - 2026-08-13

Initial release.

### Added

- `BugReportForm`, `BugReportDialog`, and `BugReportWidget` components.
- Anonymous mode that omits contact details without altering the rest of the report.
- Opt-in technical context covering URL, viewport, device pixel ratio, user agent, locale, and host-provided values.
- Optional screenshot support: file upload, DOM capture via `modern-screenshot`, display capture via `getDisplayMedia`, and a custom provider interface.
- HTTP transport (`react-bug-report/transports/http`) sending `multipart/form-data` with a typed `BugReportTransportError`.
- Sentry transport (`react-bug-report/transports/sentry`) built on the host SDK's `sendFeedback`, with no bundled Sentry dependency.
- Provider-neutral core (`react-bug-report/core`) exposing `createBugReport`, `validateBugReportInput`, `createScreenshotAttachment`, `serializeBugReport`, `redactBugReport`, and `formatBytes`.
- Light, dark, and system themes with semantic color, copy, and font overrides.
- ESM and CommonJS builds with TypeScript declarations and a published OpenAPI contract.

[Unreleased]: https://github.com/nidh-eesh/react-bug-report/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/nidh-eesh/react-bug-report/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/nidh-eesh/react-bug-report/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nidh-eesh/react-bug-report/releases/tag/v0.1.0
