import { chromium, expect, test } from "@playwright/test";

test("готовая оболочка и задачи переживают закрытие профиля без сети", async ({
  browserName,
  baseURL,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const profile = testInfo.outputPath("offline-profile");
  let context = await chromium.launchPersistentContext(profile, {
    timezoneId: "Europe/Moscow",
  });
  try {
    let page = context.pages()[0];
    await page.goto(baseURL!);
    await expect(
      page.getByText("Готово к работе офлайн", { exact: true }),
    ).toBeVisible();
    let input = page.getByRole("textbox", { name: /Новая задача/ }).first();
    await input.fill("До отключения сети");
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "Europe/Moscow",
      offline: true,
    });
    page = context.pages()[0];
    await page.goto(baseURL!);
    await expect(
      page.getByText("До отключения сети", { exact: true }),
    ).toBeVisible();
    input = page.getByRole("textbox", { name: /Новая задача/ }).first();
    await input.fill("Сохранено без сети");
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "Europe/Moscow",
      offline: true,
    });
    page = context.pages()[0];
    await page.goto(baseURL!);
    await expect(
      page.getByText("Сохранено без сети", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
