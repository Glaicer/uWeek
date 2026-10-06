import { expect, test } from "@playwright/test";

const url = "http://127.0.0.1:4202";

test("development не выдаёт себя за production-офлайн", async ({ page }) => {
  const workerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/sw.js")) workerRequests.push(request.url());
  });
  await page.goto(url);
  const input = page.getByRole("textbox", { name: /Новая задача/ }).first();
  await expect(input).toBeVisible();
  await expect(page.locator("[data-offline-status]")).toHaveCount(0);
  await expect(page.locator("[data-offline-update]")).toHaveCount(0);
  const registrations = await page.evaluate(() =>
    navigator.serviceWorker.getRegistrations(),
  );
  expect(registrations).toHaveLength(0);
  expect(workerRequests).toHaveLength(0);
});
