# Third-party notices

YourWeek source is MIT licensed. Versions below are pinned in `package.json` and `pnpm-lock.yaml`; no dependencies were added for final acceptance.

## Distributed browser dependency

Papa Parse 5.7.0 ([source](https://github.com/mholt/PapaParse)), MIT. The full notice follows and is shipped with `dist/`:

```text
The MIT License (MIT)

Copyright (c) 2015 Matthew Holt

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Build and test tools

| Direct package    | Version | License    |
| ----------------- | ------- | ---------- |
| @eslint/js        | 10.0.1  | MIT        |
| @playwright/test  | 1.63.0  | Apache-2.0 |
| @types/node       | 26.6.4  | MIT        |
| @types/papaparse  | 5.5.2   | MIT        |
| eslint            | 10.12.0 | MIT        |
| prettier          | 3.9.9   | MIT        |
| typescript        | 6.0.3   | Apache-2.0 |
| typescript-eslint | 8.71.0  | MIT        |
| vite              | 8.3.2   | MIT        |

Audit source: installed locked packages' `package.json` license declarations and Papa Parse's installed `LICENSE`, 2026-10-06. The Linux dependency tree declares MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, and MPL-2.0. These permit use alongside MIT application code; they are not relicensed by YourWeek. MPL-2.0 applies to unmodified build-only `lightningcss` and its native binary, not to YourWeek source. Build/test tools and downloaded Playwright browsers are not distributed in `dist/`; redistribution of those tools/binaries must retain their own license and notice requirements. Optional binaries for other operating systems were not installed or audited here.

No Tweek source, logo, screenshot fragments, fonts, or private export data are distributed. Personal CSV and reference screenshots are not covered by the application's MIT grant.
