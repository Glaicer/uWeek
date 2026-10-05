import { test, expect } from "@playwright/test";

test("задачи без даты используют быстрый ввод, редактор и не зависят от недели", async ({
  page,
}) => {
  await page.goto("/");
  const inbox = page.getByRole("region", {
    name: "Список: Входящие",
    exact: true,
  });
  const input = inbox.getByRole("textbox", { name: "Новая задача: Входящие" });
  await input.fill("   ");
  await input.press("Enter");
  await expect(inbox.getByRole("listitem")).toHaveCount(0);
  await input.fill("Отменить");
  await input.press("Escape");
  await expect(input).toHaveValue("");
  await input.fill("  Будущая идея  ");
  await input.press("Enter");
  await expect(
    inbox.getByRole("button", { name: "Будущая идея", exact: true }),
  ).toBeVisible();
  await input.fill("Вторая идея");
  await input.press("Enter");
  await expect(inbox.getByRole("listitem")).toHaveText([
    "Будущая идея",
    "Вторая идея",
  ]);
  await inbox
    .getByRole("button", { name: "Будущая идея", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Заметка").fill("Две строки\n<текст>");
  await editor.getByLabel("Цвет").selectOption("green");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("button", { name: "Следующая неделя" }).click();
  await expect(inbox.getByRole("listitem")).toHaveText([
    "Будущая идея",
    "Вторая идея",
  ]);
  await inbox
    .getByRole("checkbox", { name: "Выполнена: Будущая идея" })
    .check();
  await page.getByRole("checkbox", { name: "Скрыть выполненные" }).check();
  await expect(
    inbox.getByRole("button", { name: "Будущая идея", exact: true }),
  ).toBeHidden();
  await page.getByRole("checkbox", { name: "Скрыть выполненные" }).uncheck();
  await inbox
    .getByRole("button", { name: "Будущая идея", exact: true })
    .click();
  await expect(editor.getByLabel("Заметка")).toHaveValue("Две строки\n<текст>");
  await expect(editor.getByLabel("Цвет")).toHaveValue("green");
  await expect(editor.getByLabel("Выполнена", { exact: true })).toBeChecked();
  await editor.getByRole("button", { name: "Отмена", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await inbox.getByRole("button", { name: "Вторая идея", exact: true }).click();
  await editor.getByRole("button", { name: "Удалить задачу" }).click();
  await expect(inbox.getByRole("listitem")).toHaveCount(1);
});
