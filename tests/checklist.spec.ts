import { test, expect } from "@playwright/test";

test("чек-лист сохраняет текст, порядок и выполнение после перезагрузки", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await input.fill("План");
  await input.press("Enter");
  await page.getByRole("button", { name: "План", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Добавить пункт" }).click();
  await dialog
    .getByRole("textbox", { name: "Текст пункта 1", exact: true })
    .fill("Первый");
  await dialog.getByRole("button", { name: "Добавить пункт" }).click();
  await dialog
    .getByRole("textbox", { name: "Текст пункта 2", exact: true })
    .fill("<b>Второй</b>\nНовая строка ✨");
  await dialog
    .getByRole("checkbox", { name: "Выполнен пункт 2", exact: true })
    .check();
  const up = dialog.getByRole("button", {
    name: "Переместить пункт 2 вверх",
    exact: true,
  });
  await up.focus();
  await up.press("Enter");
  await expect(
    dialog.getByRole("button", {
      name: "Переместить пункт 1 вверх",
      exact: true,
    }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Выполнена: План", exact: true }),
  ).not.toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "План", exact: true }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Текст пункта 1", exact: true }),
  ).toHaveValue("<b>Второй</b>\nНовая строка ✨");
  await expect(
    dialog.getByRole("textbox", { name: "Текст пункта 2", exact: true }),
  ).toHaveValue("Первый");
  await expect(
    dialog.getByRole("checkbox", { name: "Выполнен пункт 1", exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: "Выполнен пункт 2", exact: true }),
  ).not.toBeChecked();
  await expect(dialog.locator("b")).toHaveCount(0);
});
