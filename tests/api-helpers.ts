import {
  expect,
  request,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { pinServerClock, testClockCookie } from "./clock";
import { signIn } from "./mail";

export interface ApiUser {
  page: Page;
  token: string;
  client: APIRequestContext;
  close(): Promise<void>;
}

const pinnedNow = "2026-11-09T10:00:00+03:00";

export async function issueApiToken(page: Page, name: string): Promise<string> {
  const hide = page.getByRole("button", { name: "Hide token" });
  if ((await hide.count()) > 0) await hide.click();
  await page.getByRole("textbox", { name: "Token name" }).fill(name);
  await page.getByRole("button", { name: "Create token" }).click();
  const secret = page.getByRole("textbox", { name: "New API token" });
  await expect(secret).toBeVisible();
  return secret.inputValue();
}

export async function newApiUser(
  browser: Browser,
  baseURL: string,
): Promise<ApiUser> {
  const context = await browser.newContext({
    baseURL,
    timezoneId: "Europe/Moscow",
  });
  await pinServerClock(context, pinnedNow);
  const page = await context.newPage();
  await signIn(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "API tokens" }).click();
  const token = await issueApiToken(page, "Agent");
  const client = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    storageState: {
      cookies: [
        {
          name: testClockCookie,
          value: new Date(pinnedNow).toISOString(),
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  });
  return {
    page,
    token,
    client,
    async close() {
      await client.dispose();
      await context.close();
    },
  };
}
