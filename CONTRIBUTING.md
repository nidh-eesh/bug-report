# Contributing

Thanks for your interest in improving `react-bug-report`. Issues and focused pull requests are welcome.

## Getting started

```sh
git clone https://github.com/nidh-eesh/react-bug-report.git
cd react-bug-report
npm install
npm run demo
```

The demo runs at `http://127.0.0.1:4178`. Node.js 20 or newer is required for the tooling.

## Before opening a pull request

1. Keep public behavior provider-neutral unless an adapter owns the integration.
2. Add regression coverage for behavior changes.
3. Run `npm run verify` and the relevant browser tests.
4. Confirm `npm run check:pack` contains only intended public files.
5. Note any privacy, accessibility, compatibility, or bundle-size implications.

Browser tests need Playwright browsers:

```sh
npx playwright install chromium firefox
npm run test:e2e
```

## Reporting bugs

Search existing issues first. Include the package version, browser, framework, a reproduction, expected behavior, and actual behavior. Do not include tokens, private reports, or screenshots containing sensitive data.

For suspected vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
