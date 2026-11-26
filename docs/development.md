# Development

## Setup

Requires Node.js 24+, pnpm 12.3.4 and Docker.

```sh
pnpm install --frozen-lockfile
cp .env.example .env       # set BETTER_AUTH_SECRET; uncomment MAIL_OUTBOX_DIR for local email
pnpm dev                   # http://127.0.0.1:4200
```

`pnpm dev` starts Postgres 18 itself (`docker compose up -d --wait`, 127.0.0.1:5433, databases `uweek` and `uweek_test`) and applies migrations; `pnpm test` and `pnpm test:e2e` start Postgres themselves too.

With `MAIL_OUTBOX_DIR=.outbox` the sign-in link is in the newest `.outbox/*.json` file.

After changing `src/db/schema.ts`, generate a migration with `pnpm db:generate`; a running `pnpm dev` applies it on its own (it watches `drizzle/meta`); without a dev server, run `pnpm db:migrate`.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test` runs the vitest integration tests (`src/**/*.test.ts`) against the `uweek_test` database, applying migrations first.

`pnpm test:e2e`: Playwright applies migrations to `uweek_test` and starts its own `next dev` on port 4172 with a separate build folder `.next-e2e`, so it doesn't interfere with a running `pnpm dev`. Emails are captured through `MAIL_OUTBOX_DIR=test-results/outbox`.

## Branches and releases

- `main` is production: Vercel builds and deploys every push to it. Nobody commits or pushes to it directly; a GitHub ruleset allows changes only through a pull request merged with a merge commit, and blocks force pushes and deletion.
- `dev` is where work is tested before release: chores and small changes go straight to `dev`.
- A large feature gets its own branch from `dev` and is merged back into `dev` when finished. Run the [checks](#checks) on `dev` after the merge: Vercel doesn't deploy `dev` or feature branches, so testing is local.
- To release, open a pull request from `dev` to `main` (`gh pr create --base main --head dev`) and merge it with a merge commit, so `dev` and `main` keep a common history.
- An urgent production fix that can't wait for untested work in `dev` goes in a `hotfix/<name>` branch from `main`, through a pull request to `main`; then merge `main` back into `dev`.
