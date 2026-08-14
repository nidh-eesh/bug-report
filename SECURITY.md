# Security Policy

## Supported versions

`react-bug-report` is pre-1.0. Security fixes are applied to the latest published `0.x` release.

| Version | Supported |
| --- | --- |
| `0.2.x` | Yes |

## Reporting a vulnerability

Do not post a suspected vulnerability, secret, or sensitive report payload in a public issue.

Use [GitHub's private vulnerability reporting](https://github.com/nidh-eesh/react-bug-report/security/advisories/new) for this repository. If that channel is unavailable, contact the maintainer privately through the contact method listed on the maintainer's GitHub profile, and share only the minimum information required to coordinate a fix.

No disclosure SLA or paid bug-bounty program is currently offered.

## Scope

This package renders a bug-report UI and hands a validated report to a transport you supply. Client-side validation is a usability boundary, not a security boundary.

The receiving server is responsible for:

- authentication, CSRF protection where applicable, and abuse controls
- request and attachment size limits, rate limiting, and quotas
- image MIME and file-signature validation
- generated storage keys rather than trusting client filenames
- authorization for reading reports and attachments, plus retention and deletion
- output encoding, never rendering report text as HTML
- log and error scrubbing

See [`openapi.yaml`](./openapi.yaml) for the server contract.

Do not ship long-lived provider secrets in browser-side headers or adapters. Use short-lived authorization or send to a same-origin backend. Treat screenshots, URLs, host-provided context, and free-text descriptions as potentially sensitive.
