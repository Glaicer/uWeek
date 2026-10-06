import { chromium, test, expect } from "@playwright/test";

test("чек-лист переживает закрытие профиля и удаляется вместе с родителем на узком экране", async ({
  browserName,
  baseURL,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const profile = testInfo.outputPath("profile");
  const options = {
    timezoneId: "Europe/Moscow",
    viewport: { width: 320, height: 700 },
  };
  let context = await chromium.launchPersistentContext(profile, options);
  const longText =
    'Длинный текст ✨ <script>alert("нет")</script>\n' +
    "Подробный шаг без сокращений. ".repeat(25);
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(baseURL!);
    await page
      .getByRole("region", { name: "понедельник, 5 октября" })
      .getByRole("textbox")
      .fill("Профиль");
    await page
      .getByRole("region", { name: "понедельник, 5 октября" })
      .getByRole("textbox")
      .press("Enter");
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Добавить пункт" }).click();
    await dialog
      .getByRole("textbox", { name: "Текст пункта 1", exact: true })
      .fill("Первый");
    await dialog.getByRole("button", { name: "Добавить пункт" }).click();
    await dialog
      .getByRole("textbox", { name: "Текст пункта 2", exact: true })
      .fill(longText);
    await dialog
      .getByRole("checkbox", { name: "Выполнен пункт 2", exact: true })
      .check();
    await dialog
      .getByRole("button", { name: "Переместить пункт 2 вверх", exact: true })
      .press("Enter");
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(baseURL!);
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    dialog = page.getByRole("dialog");
    const text = dialog.getByRole("textbox", {
      name: "Текст пункта 1",
      exact: true,
    });
    await expect(text).toHaveValue(longText);
    await expect(
      dialog.getByRole("textbox", { name: "Текст пункта 2", exact: true }),
    ).toHaveValue("Первый");
    await expect(
      dialog.getByRole("checkbox", { name: "Выполнен пункт 1", exact: true }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("checkbox", { name: "Выполнена", exact: true }),
    ).not.toBeChecked();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await text.focus();
    await text.press("Tab");
    const up = dialog.getByRole("button", {
      name: "Переместить пункт 1 вверх",
      exact: true,
    });
    await expect(up).toBeFocused();
    expect(
      await up.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).toBe("solid");
    await expect(dialog.locator("script")).toHaveCount(0);
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByRole("button", { name: "Удалить задачу" }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Профиль", exact: true }),
    ).toHaveCount(0);
    const input = page
      .getByRole("region", { name: "понедельник, 5 октября" })
      .getByRole("textbox");
    await input.fill("Профиль");
    await input.press("Enter");
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: "Текст пункта" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
