import { test, expect } from "@playwright/test";

test("переименование, отмена и удаление сохраняют идентичность и независимость статусов", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await input.fill("Шаги");
  await input.press("Enter");
  const task = page.getByRole("button", { name: "Шаги", exact: true });
  await task.click();
  const dialog = page.getByRole("dialog");
  const first = dialog.getByRole("textbox", {
    name: "Текст пункта 1",
    exact: true,
  });
  const second = dialog.getByRole("textbox", {
    name: "Текст пункта 2",
    exact: true,
  });
  const save = dialog.getByRole("button", { name: "Сохранить", exact: true });
  await dialog.getByRole("button", { name: "Добавить пункт" }).click();
  await first.fill("Шаг А");
  const identity = await first.getAttribute("id");
  expect(identity).toMatch(/^checklist-.+/);
  await dialog
    .getByRole("checkbox", { name: "Выполнен пункт 1", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Добавить пункт" }).click();
  await second.fill("Шаг Б");
  await dialog
    .getByRole("checkbox", { name: "Выполнен пункт 2", exact: true })
    .check();
  await save.click();
  await expect(dialog).not.toBeVisible();
  const parent = page.getByRole("checkbox", {
    name: "Выполнена: Шаги",
    exact: true,
  });
  await expect(parent).not.toBeChecked();
  await parent.check();
  await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
  await parent.uncheck();
  await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
  await task.click();
  await expect(
    dialog.getByRole("checkbox", { name: "Выполнен пункт 1", exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: "Выполнен пункт 2", exact: true }),
  ).toBeChecked();
  await first.fill("Не сохранять");
  await dialog
    .getByRole("checkbox", { name: "Выполнен пункт 1", exact: true })
    .uncheck();
  await dialog
    .getByRole("button", { name: "Удалить пункт 2", exact: true })
    .click();
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(first).toHaveValue("Не сохранять");
  page.once("dialog", (confirmation) => confirmation.accept());
  await first.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await task.click();
  await expect(first).toHaveValue("Шаг А");
  await expect(second).toHaveValue("Шаг Б");
  await expect(first).toHaveAttribute("id", identity!);
  await expect(
    dialog.getByRole("checkbox", { name: "Выполнен пункт 1", exact: true }),
  ).toBeChecked();
  await first.fill("Новое имя");
  await dialog
    .getByRole("button", { name: "Переместить пункт 1 вниз", exact: true })
    .press("Space");
  await expect(second).toHaveAttribute("id", identity!);
  await save.click();
  await expect(dialog).not.toBeVisible();
  await task.click();
  await expect(second).toHaveValue("Новое имя");
  await expect(second).toHaveAttribute("id", identity!);
  await dialog
    .getByRole("button", { name: "Удалить пункт 1", exact: true })
    .click();
  await save.click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await task.click();
  await expect(first).toHaveValue("Новое имя");
  await expect(first).toHaveAttribute("id", identity!);
  await expect(second).toHaveCount(0);
});
