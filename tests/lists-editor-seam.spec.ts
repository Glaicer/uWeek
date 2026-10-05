import { test, expect } from "@playwright/test";

test("список использует общий редактор и сохраняет чек-лист при выполнении и переименовании", async ({
  page,
}) => {
  await page.goto("/");
  const list = page.getByRole("region", {
    name: "Список: Личное",
    exact: true,
  });
  const input = list.getByRole("textbox", { name: "Новая задача: Личное" });
  await input.fill("Отложенный план");
  await input.press("Enter");
  await list
    .getByRole("button", { name: "Отложенный план", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("button", { name: "Добавить пункт" }).click();
  await editor
    .getByRole("textbox", { name: "Текст пункта 1", exact: true })
    .fill("Шаг без даты");
  await editor
    .getByRole("checkbox", { name: "Выполнен пункт 1", exact: true })
    .check();
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await list
    .getByRole("checkbox", { name: "Выполнена: Отложенный план" })
    .check();
  await list.getByRole("button", { name: "Переименовать список" }).click();
  await list
    .getByRole("textbox", { name: "Название списка", exact: true })
    .fill("Мои планы");
  await list.getByRole("button", { name: "Сохранить название" }).click();
  await page.reload();
  await page
    .getByRole("region", { name: "Список: Мои планы", exact: true })
    .getByRole("button", { name: "Отложенный план", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Текст пункта 1", exact: true }),
  ).toHaveValue("Шаг без даты");
  await expect(
    editor.getByRole("checkbox", { name: "Выполнен пункт 1", exact: true }),
  ).toBeChecked();
  await expect(
    editor.getByRole("checkbox", { name: "Выполнена", exact: true }),
  ).toBeChecked();
});
