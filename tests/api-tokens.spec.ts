import { expect, test } from "@playwright/test";
import { signIn } from "./mail";

test("API token settings require a session", async ({ page }) => {
  await page.goto("/settings/api-tokens");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();

  await signIn(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("link", { name: "API tokens" }).click();

  await expect(page).toHaveURL(/\/settings\/api-tokens$/);
  await expect(page.getByRole("heading", { name: "API tokens" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to week" })).toBeVisible();
  await expect(page.getByRole("link", { name: "OpenAPI" })).toHaveAttribute(
    "href",
    "/api/v1/openapi.json",
  );
  await expect(page.getByText("No API tokens yet.")).toBeVisible();
});

test("a user creates a named token and sees its secret only once", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/api-tokens");

  const name = page.getByRole("textbox", { name: "Token name" });
  await name.fill("Agent");
  await page.getByRole("button", { name: "Create token" }).click();

  await expect(
    page.getByText("Copy this token now. You won't be able to see it again."),
  ).toBeVisible();
  const secret = page.getByRole("textbox", { name: "New API token" });
  const token = await secret.inputValue();
  expect(token).toMatch(/^yw_[A-Za-z0-9_-]{43}$/);

  const row = page.getByRole("row", { name: /Agent/ });
  await expect(row).toContainText(token.slice(0, 11));
  await expect(row).toContainText("Never used");
  await expect(row).not.toContainText(token);

  await page.getByRole("button", { name: "Hide token" }).click();
  await expect(secret).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "New API token" }),
  ).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Agent/ })).toContainText(
    token.slice(0, 11),
  );

  await name.fill("Second");
  await page.getByRole("button", { name: "Create token" }).click();
  await expect(
    page.getByRole("textbox", { name: "New API token" }),
  ).toHaveValue(/^yw_/);
  await expect(page.getByRole("row", { name: /Second/ })).toBeVisible();
});

test("token settings remain usable at 360 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await page.goto("/settings/api-tokens");

  const name = page.getByRole("textbox", { name: "Token name" });
  await name.fill("   ");
  await page.getByRole("button", { name: "Create token" }).click();
  await expect(page.getByText("Enter a token name.")).toBeVisible();

  const longName = "Agent for the long-running import ".repeat(3).slice(0, 100);
  await name.fill(longName);
  await page.getByRole("button", { name: "Create token" }).click();
  const secret = page.getByRole("textbox", { name: "New API token" });
  const token = await secret.inputValue();
  expect(token).toMatch(/^yw_[A-Za-z0-9_-]{43}$/);

  const row = page.getByRole("row", {
    name: new RegExp(longName.slice(0, 20)),
  });
  await expect(row).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide token" })).toBeVisible();

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  expect(page.url()).not.toContain(token);
  expect(
    await page.evaluate(
      (value) =>
        [localStorage, sessionStorage].some((storage) =>
          Object.values(storage).some((item) => String(item).includes(value)),
        ),
      token,
    ),
  ).toBe(false);

  await page.getByRole("button", { name: "Hide token" }).click();
  await expect(secret).toHaveCount(0);

  await page.getByRole("button", { name: `Revoke ${longName}` }).click();
  await expect(
    page.getByRole("button", { name: `Revoke ${longName}` }),
  ).toHaveCount(0);
  await expect(page.getByText("No API tokens yet.")).toBeVisible();

  const after = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(after.scroll).toBeLessThanOrEqual(after.client);
});

test("a token action without a session sends the visitor to sign in", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/api-tokens");
  await page.context().clearCookies();

  await page.getByRole("textbox", { name: "Token name" }).fill("Agent");
  await page.getByRole("button", { name: "Create token" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
});
