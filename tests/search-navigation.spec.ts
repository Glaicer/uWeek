import { test, expect } from "@playwright/test";

test("search editor keeps query, refreshes edits and navigates to a hidden completed far task or list", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.locator(".day").first().getByRole("textbox");
  await input.fill("Маркер план");
  await input.press("Enter");
  await page.getByRole("button", { name: "Маркер план", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await editor.getByLabel("Дата задачи", { exact: true }).fill("2040-01-01");
  await editor.getByLabel("Выполнена", { exact: true }).check();
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByLabel("Скрыть выполненные", { exact: true }).check();
  await expect(page.getByRole("status").first()).toHaveText(
    "Настройка сохранена",
  );
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Поиск задач" });
  const query = search.getByLabel("Поиск по тексту", { exact: true });
  await query.fill("маркер");
  await search
    .getByRole("button", { name: "Маркер план", exact: true })
    .click();
  await editor.getByLabel("Название", { exact: true }).fill("Маркер изменён");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(query).toHaveValue("маркер");
  await expect(
    search.getByRole("button", { name: "Маркер изменён", exact: true }),
  ).toBeVisible();
  await search
    .getByRole("button", { name: "Перейти к задаче", exact: true })
    .click();
  await expect(search).toHaveCount(0);
  const boardTitle = page.locator('.day[data-date="2040-01-01"] .task-title');
  await expect(boardTitle).toBeVisible();
  await expect(boardTitle).toBeFocused();
  await expect(
    page.getByLabel("Скрыть выполненные", { exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(boardTitle).toBeHidden();
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  await query.fill("маркер");
  await search
    .getByRole("button", { name: "Маркер изменён", exact: true })
    .click();
  await editor.getByLabel("Размещение", { exact: true }).selectOption("list");
  await editor
    .getByLabel("Список задачи", { exact: true })
    .selectOption({ label: "Идеи" });
  await editor.getByLabel("Выполнена", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(search.getByRole("listitem")).toContainText("Идеи");
  await search
    .getByRole("button", { name: "Перейти к задаче", exact: true })
    .click();
  const listTitle = page
    .getByRole("region", { name: "Список: Идеи", exact: true })
    .getByRole("button", { name: "Маркер изменён", exact: true });
  await expect(listTitle).toBeVisible();
  await expect(listTitle).toBeFocused();
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  await query.fill("маркер");
  await search
    .getByRole("button", { name: "Маркер изменён", exact: true })
    .click();
  await editor
    .getByLabel("Название", { exact: true })
    .fill("Больше не совпадает");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(query).toHaveValue("маркер");
  await expect(search).toContainText("Ничего не найдено");
});
