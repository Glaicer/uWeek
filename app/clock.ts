import { cookies } from "next/headers";

export async function requestTime(): Promise<Date> {
  const cookie = process.env.TEST_CLOCK_COOKIE;
  // why: e2e tests pin the server's "today"; only the Playwright server sets TEST_CLOCK_COOKIE
  if (cookie && process.env.NODE_ENV !== "production") {
    const pinned = (await cookies()).get(cookie)?.value;
    if (pinned) return new Date(pinned);
  }
  return new Date();
}
