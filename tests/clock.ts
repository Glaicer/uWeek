import type { BrowserContext } from "@playwright/test";

export const testClockCookie = "test-now";

export async function pinServerClock(
  context: BrowserContext,
  time: string,
): Promise<void> {
  await context.addCookies([
    {
      name: testClockCookie,
      value: new Date(time).toISOString(),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}
