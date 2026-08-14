# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/nidh-eesh/react-bug-report/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nidh-eesh/react-bug-report/releases/tag/v0.1.0
