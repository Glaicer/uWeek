import { chromium, test, expect } from "@playwright/test";

test("повторное открытие того же профиля сохраняет заметку, цвет, выполнение и фильтр", async ({
  browserName,
  baseURL,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const profile = testInfo.outputPath("profile");
  let context = await chromium.launchPersistentContext(profile, {
    timezoneId: "Europe/Moscow",
  });
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(baseURL!);
    const input = page
      .getByRole("region", { name: "понедельник, 5 октября" })
      .getByRole("textbox");
    await input.fill("После закрытия");
    await input.press("Enter");
    await page
      .getByRole("button", { name: "После закрытия", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Заметка" })
      .fill('Подробности ✨\n"Кавычки"');
    await dialog.getByLabel("Цвет").selectOption("purple");
    await dialog
      .getByRole("checkbox", { name: "Выполнена", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("checkbox", { name: "Скрыть выполненные" }).check();
    await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "Europe/Moscow",
    });
    page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(baseURL!);
    const filter = page.getByRole("checkbox", { name: "Скрыть выполненные" });
    await expect(filter).toBeChecked();
    await expect(
      page.getByRole("button", { name: "После закрытия", exact: true }),
    ).not.toBeVisible();
    await filter.uncheck();
    await page
      .getByRole("button", { name: "После закрытия", exact: true })
      .click();
    const reopened = page.getByRole("dialog");
    await expect(
      reopened.getByRole("textbox", { name: "Заметка" }),
    ).toHaveValue('Подробности ✨\n"Кавычки"');
    await expect(reopened.getByLabel("Цвет")).toHaveValue("purple");
    await expect(
      reopened.getByRole("checkbox", { name: "Выполнена", exact: true }),
    ).toBeChecked();
  } finally {
    await context.close();
  }
});
