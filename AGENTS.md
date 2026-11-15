## Agent skills

### Issue tracker

Issues and specs live as local Markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles as status strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/`. Before exploring domain concepts or decisions, read `docs/agents/domain.md`.

`/docs/` is in `.gitignore`, but its files are tracked: add a new file there with `git add -f`, or it never reaches git.

### Default tech stack

Before choosing a library or tool for a task, read `docs/tech-stack.md`: accepted defaults (zustand 5.0.15, zod 4.6.7), the approved `yourweek-cloud` stack (drizzle + pg, better-auth, resend, MCP server v2, zod-openapi, rate-limiter-flexible, vitest) with the ticket that installs each package, the explicit "not adopted" list with reasons, and the rules for adding any new dependency (resolve the current stable from the registry, pin the exact version, respect the spec's "no dependency unless used now" constraint). New dependencies are installed only with the owner's approval.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

### Tests

`pnpm dev`, `pnpm test` and `pnpm test:e2e` start Postgres themselves (`pnpm db:up`); `pnpm dev` also migrates the dev database `yourweek`, while tests migrate only `yourweek_test`. Playwright starts its own `next dev` with `NEXT_DIST_DIR=.next-e2e` so it can run beside the owner's `pnpm dev` (Next allows one dev server per dist dir); keep the `.next-e2e` entries in `tsconfig.json`, or every test run rewrites the file. Sign-in emails land in `test-results/outbox` via `MAIL_OUTBOX_DIR`.

`pnpm test` (vitest) runs integration tests from `src/**/*.test.ts` against `yourweek_test`. Keep them out of `tests/`: that is Playwright's `testDir`, and it would pick up any `*.test.ts` there.
