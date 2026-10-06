import { test, expect } from "@playwright/test";

const header = "Date,Task,Notes,Checklist,Completed,List";

async function importCsv(
  page: import("@playwright/test").Page,
  rows: string[],
) {
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "navigation.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`${header}\n${rows.join("\n")}`),
  });
  await page
    .getByRole("dialog", { name: "Импорт CSV" })
    .getByRole("button", { name: "Подтвердить импорт" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("редактор из поиска сохраняет запрос, обновляет выдачу и показывает пустое состояние после переименования", async ({
  page,
}) => {
  await page.goto("/");
  await importCsv(page, ["2040-01-01,Маркер план,,,TRUE,"]);
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
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await editor.getByLabel("Название", { exact: true }).fill("Маркер изменён");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(query).toHaveValue("маркер");
  await expect(
    search.getByRole("button", { name: "Маркер изменён", exact: true }),
  ).toBeVisible();
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

test("переход к задаче открывает нужную неделю, показывает скрытую выполненную задачу и не меняет фильтр доски", async ({
  page,
}) => {
  await page.goto("/");
  await importCsv(page, ["2040-01-01,Маркер план,,,TRUE,"]);
  await page.getByLabel("Скрыть выполненные", { exact: true }).check();
  await expect(page.getByRole("status").first()).toHaveText(
    "Настройка сохранена",
  );
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Поиск задач" });
  const query = search.getByLabel("Поиск по тексту", { exact: true });
  await query.fill("маркер");
  await expect(
    search.getByRole("button", { name: "Маркер план", exact: true }),
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
});

test("переход к задаче из поиска открывает список «Когда-нибудь» и фокусирует задачу", async ({
  page,
}) => {
  await page.goto("/");
  await importCsv(page, [",Маркер списка,,,FALSE,Идеи"]);
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Поиск задач" });
  const query = search.getByLabel("Поиск по тексту", { exact: true });
  await query.fill("маркер списка");
  await expect(
    search.getByRole("button", { name: "Маркер списка", exact: true }),
  ).toBeVisible();
  await search
    .getByRole("button", { name: "Перейти к задаче", exact: true })
    .click();
  await expect(search).toHaveCount(0);
  const listTitle = page
    .getByRole("region", { name: "Список: Идеи", exact: true })
    .getByRole("button", { name: "Маркер списка", exact: true });
  await expect(listTitle).toBeVisible();
  await expect(listTitle).toBeFocused();
});

// Перенос задачи в список через размещение редактора (появилось в №05).
test("перенос задачи в список через редактор обновляет выдачу и переход открывает список", async ({
  page,
}) => {
  await page.goto("/");
  await importCsv(page, ["2040-01-01,Маркер план,,,TRUE,"]);
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Поиск задач" });
  const query = search.getByLabel("Поиск по тексту", { exact: true });
  await query.fill("маркер");
  await search
    .getByRole("button", { name: "Маркер план", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await expect(editor.getByLabel("Размещение", { exact: true })).toHaveCount(1);
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
  await expect(search).toHaveCount(0);
  const listTitle = page
    .getByRole("region", { name: "Список: Идеи", exact: true })
    .getByRole("button", { name: "Маркер план", exact: true });
  await expect(listTitle).toBeVisible();
  await expect(listTitle).toBeFocused();
});
