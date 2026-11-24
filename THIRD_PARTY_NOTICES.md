# Third-party notices

uWeek source is MIT licensed. Versions below are pinned in `package.json` and `pnpm-lock.yaml`; the app is delivered by Next.js (`pnpm build`, `pnpm start`), which ships `next`, `react` and `react-dom` browser code alongside the application.

## Distributed framework dependencies (Next.js delivery)

The browser also receives framework code and the error reporter, all MIT:

| Direct package | Version | License | Source                                         |
| -------------- | ------- | ------- | ---------------------------------------------- |
| next           | 16.3.8  | MIT     | https://github.com/vercel/next.js              |
| react          | 19.3.0  | MIT     | https://github.com/facebook/react              |
| react-dom      | 19.3.0  | MIT     | https://github.com/facebook/react              |
| @sentry/nextjs | 11.16.0 | MIT     | https://github.com/getsentry/sentry-javascript |

Their MIT texts follow the same terms as the application's `LICENSE` (copyright Meta Platforms, Inc. for React and React DOM; Vercel, Inc. for Next.js).

## Build and test tools

| Direct package            | Version | License    |
| ------------------------- | ------- | ---------- |
| @eslint/js                | 10.0.1  | MIT        |
| @next/eslint-plugin-next  | 16.3.8  | MIT        |
| @playwright/test          | 1.63.0  | Apache-2.0 |
| @types/node               | 26.6.4  | MIT        |
| @types/react              | 19.3.0  | MIT        |
| @types/react-dom          | 19.3.0  | MIT        |
| eslint                    | 10.12.0 | MIT        |
| eslint-plugin-react-hooks | 7.1.1   | MIT        |
| prettier                  | 3.9.9   | MIT        |
| typescript                | 6.0.3   | Apache-2.0 |
| typescript-eslint         | 8.71.0  | MIT        |

Audit source: installed locked packages' `package.json` license declarations, 2026-10-06. The Linux dependency tree declares MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, and MPL-2.0. These permit use alongside MIT application code; they are not relicensed by uWeek. MPL-2.0 applies to unmodified build-only `lightningcss` and its native binary, not to uWeek source. Build/test tools and downloaded Playwright browsers are not distributed in `dist/`; redistribution of those tools/binaries must retain their own license and notice requirements. Optional binaries for other operating systems were not installed or audited here.

No Tweek source, logo, screenshot fragments, or fonts are distributed. Reference screenshots are not covered by the application's MIT grant.
