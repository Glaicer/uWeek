import { expect, test } from "@playwright/test";
import { googleClientId } from "./google";
import { signIn, signInLinkFor, uniqueEmail } from "./mail";

test("a visitor without a session is sent to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
});

test("a visitor signs in with the emailed link, stays signed in after a browser restart and signs out", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  const email = uniqueEmail();

  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByRole("status")).toHaveText(
    `Check your email. We sent a sign-in link to ${email}.`,
  );
  await page.goto(await signInLinkFor(email));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();

  const persistent = (await first.cookies()).filter(
    (cookie) => cookie.expires > Date.now() / 1000 + 24 * 60 * 60,
  );
  await first.close();

  const restarted = await browser.newContext();
  await restarted.addCookies(persistent);
  const again = await restarted.newPage();
  await again.goto("/");
  await expect(again.getByRole("button", { name: "Menu" })).toBeVisible();

  await again.getByRole("button", { name: "Menu" }).click();
  await again.getByRole("button", { name: "Sign out" }).click();
  await expect(again).toHaveURL(/\/sign-in$/);
  await again.goto("/");
  await expect(again).toHaveURL(/\/sign-in$/);
  await restarted.close();
});

test("a used sign-in link does not sign in again", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail();
  await signIn(page, email);
  const link = await signInLinkFor(email);

  const other = await browser.newPage();
  await other.goto(link);
  await expect(other).toHaveURL(/\/sign-in\?error=INVALID_TOKEN$/);
  await expect(other.getByRole("main").getByRole("alert")).toHaveText(
    "This link has expired or was already used. Request a new one.",
  );
  await other.close();
});

test("Continue with Google sends the visitor to Google with this app's callback", async ({
  page,
  context,
  baseURL,
}) => {
  await page.route("https://accounts.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Google</h1>" }),
  );
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL(/^https:\/\/accounts\.google\.com\//);

  const authorizeUrl = new URL(page.url());
  expect(authorizeUrl.searchParams.get("client_id")).toBe(googleClientId);
  expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
    `${baseURL}/api/auth/callback/google`,
  );
  expect((await context.cookies()).map((cookie) => cookie.name)).toContain(
    "better-auth.state",
  );
});

test("a failed Google sign-in says so on the sign-in page", async ({
  page,
}) => {
  await page.goto("/sign-in?provider=google&error=access_denied");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Google sign-in didn't finish. Try again or sign in with an email link.",
  );
});
