import { chromium, test, expect } from "@playwright/test";

test("повторное открытие браузерного профиля сохраняет задачи и календарную дату при смене часового пояса", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const profile = testInfo.outputPath("profile");
  let context = await chromium.launchPersistentContext(profile, {
    timezoneId: "Pacific/Kiritimati",
  });
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+14:00"));
    await page.goto("http://127.0.0.1:4171");
    const input = page
      .getByRole("region", { name: "понедельник, 5 октября" })
      .getByRole("textbox");
    await input.fill("Стабильная дата");
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "America/Los_Angeles",
    });
    page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00-07:00"));
    await page.goto("http://127.0.0.1:4171");
    await expect(
      page
        .getByRole("region", { name: "понедельник, 5 октября" })
        .getByRole("listitem")
        .locator(".task-title"),
    ).toHaveText("Стабильная дата");
  } finally {
    await context.close();
  }
});
