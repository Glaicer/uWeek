# Self-hosting

## Architecture

One Next.js (App Router) application on Node.js: pages, server actions and API routes.

- **Postgres 18** is the single source of truth. The schema lives in `src/db/schema.ts` (Drizzle ORM); drizzle-kit generates SQL migrations into `drizzle/`, and `src/db/migrate.ts` applies them.
- **Authentication** is better-auth with the magic link plugin and Google sign-in (`socialProviders.google`): `src/auth.ts`, handler `app/api/auth/[...all]/route.ts`. Users, sessions, accounts and one-time sign-in tokens are stored in the same database. The session is a 7-day cookie, extended on use. A Google account with a verified email links to the existing user with that email instead of creating a duplicate; better-auth rejects an unverified email.
- **Email** goes through Resend (`src/mail.ts`). When `MAIL_OUTBOX_DIR` is set, emails are written as JSON files to that folder instead of being sent: this is how development without a Resend key and the Playwright tests work.
- **Styling** is plain CSS: tokens in `app/globals.css`, CSS Modules next to the components.
- **Domain logic** with no framework dependencies: `src/calendar.ts` (calendar dates without UTC bugs, ISO week) and `src/model.ts` (task colors and placement).

Pages: `/sign-in` asks for the email; `/sign-in/confirm?token=…` is the link from the email: GET changes nothing and the "Sign in" button completes the sign-in, so mail scanners and prefetchers can't burn the link; `/` is the current week, `/?week=YYYY-MM-DD` the week containing that date; without a session it redirects to sign-in. Sign-out and the week start are in the header menu.

## Google sign-in

The "Continue with Google" button on the sign-in page appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; without them the app works as before, with the email link.

1. In Google Cloud Console → Google Auth Platform, fill in Branding and set Audience to External. While the publishing status is Testing, only addresses on the test users list can sign in.
2. Clients → Create client → Web application.
3. Under Authorized redirect URIs add `http://127.0.0.1:4200/api/auth/callback/google` for development and `https://<domain>/api/auth/callback/google` for production. better-auth builds the URI from `BETTER_AUTH_URL`, and Google compares it exactly, so `localhost` and `127.0.0.1` are different URIs. Plain http is allowed only for localhost and loopback addresses.
4. Copy the Client ID and Client secret into `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and restart `pnpm dev`.

## Deployment

The whole application runs in Vercel functions (Hobby, region `fra1` in `vercel.json`). Postgres 18 runs on a separate server. The app connects to it over TLS with `sslmode=verify-full`, so the server certificate must come from a public CA: pg 8 treats `sslmode=require` as `verify-full` too.

### Vercel

1. Import the repository as a Next.js project and turn on "Automatically expose System Environment Variables": without it the build doesn't see `VERCEL_ENV`.
2. In the Production environment set:
   - `DATABASE_URL=postgres://<user>:<password>@<host>:<port>/<db>?sslmode=verify-full`;
   - `BETTER_AUTH_SECRET`;
   - `BETTER_AUTH_URL=https://<domain>`;
   - `RESEND_API_KEY` and `MAIL_FROM` (a sender on a domain verified in Resend);
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`;
   - `NEXT_PUBLIC_SENTRY_DSN`: the GlitchTip (or Sentry) project DSN;
   - `ENABLE_EXPERIMENTAL_COREPACK=1`: without it Vercel installs pnpm by the lockfile version instead of `pnpm@12.3.4`.

   Don't set `MAIL_OUTBOX_DIR` or `TEST_CLOCK_COOKIE`.

3. Attach your domain. In Google Auth Platform add the redirect URI `https://<domain>/api/auth/callback/google`.

The build runs `pnpm build:vercel`. In a production build it first applies migrations (`pnpm db:migrate`; a rerun changes nothing), then runs `next build`. Traffic switches only after a successful build, so until then the old version runs on the new schema, and a migration must stay compatible with it. Only `main` deploys (`git.deploymentEnabled` in `vercel.json`): previews would have no database.

Each function has its own pool: `max: 5`, idle connections close after 5 s (`attachDatabasePool`). The API rate limit (120 requests per minute per token) is kept in the `rate_limits` table and shared by all instances. Server and browser errors go to GlitchTip through `@sentry/nextjs` when `NEXT_PUBLIC_SENTRY_DSN` is set. Source maps aren't uploaded, so stack traces in GlitchTip are minified.
