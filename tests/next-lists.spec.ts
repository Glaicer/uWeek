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
  await expect(inbox.getByRole("listitem").locator(".task-title")).toHaveText([
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
  await expect(inbox.getByRole("listitem").locator(".task-title")).toHaveText([
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

test("переименование и удаление других списков не сбрасывают черновики быстрого ввода", async ({
  page,
}) => {
  await page.goto("/");
  const personal = page.getByRole("region", {
    name: "Список: Личное",
    exact: true,
  });
  const draft = personal.getByRole("textbox", {
    name: "Новая задача: Личное",
  });
  await draft.fill("Черновик переживает списки");
  const inbox = page.getByRole("region", {
    name: "Список: Входящие",
    exact: true,
  });
  await inbox.getByRole("button", { name: "Переименовать список" }).click();
  const renameInput = inbox.getByRole("textbox", {
    name: "Название списка",
    exact: true,
  });
  await renameInput.fill("Первичное");
  await inbox.getByRole("button", { name: "Сохранить название" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Название списка сохранено",
  );
  await expect(draft).toHaveValue("Черновик переживает списки");
  const create = page.getByRole("textbox", { name: "Название нового списка" });
  await create.fill("Временный");
  await create.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Список сохранён");
  await page
    .getByRole("region", { name: "Список: Временный", exact: true })
    .getByRole("button", { name: "Удалить список", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Список удалён");
  await expect(
    page.getByRole("region", { name: "Список: Временный", exact: true }),
  ).toHaveCount(0);
  await expect(draft).toHaveValue("Черновик переживает списки");
  await draft.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await expect(
    personal.getByRole("listitem").locator(".task-title"),
  ).toHaveText("Черновик переживает списки");
});
