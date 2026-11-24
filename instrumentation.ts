import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN });
  if (process.env.NODE_ENV === "development") {
    const { migrateNowAndOnChange } = await import("./src/db/dev-migrations");
    await migrateNowAndOnChange();
  }
}

export const onRequestError = Sentry.captureRequestError;
