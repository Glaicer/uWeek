import { test, expect, type Page } from "@playwright/test";

async function importRows(page: Page, rows: string[]) {
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "search.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `Date,Task,Notes,Checklist,Completed,List\n${rows.join("\n")}`,
    ),
  });
  await page
    .getByRole("dialog", { name: "Импорт CSV" })
    .getByRole("button", { name: "Подтвердить импорт" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("global offline substring search includes hidden completed tasks and all text fields", async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-06T12:00:00+03:00"));
  await page.goto("/");
  await importRows(page, [
    "2040-01-01,Дальний МАРКЕР,,,TRUE,",
    ",Заметка,мой маркер здесь,,FALSE,Личное",
    ",Шаги,,,FALSE,Идеи",
  ]);
  await page.getByRole("button", { name: "Шаги", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await editor.getByRole("button", { name: "Добавить пункт" }).click();
  await editor.getByLabel("Текст пункта 1", { exact: true }).fill("Чек МАрКер");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByLabel("Скрыть выполненные", { exact: true }).check();
  await expect(page.getByRole("status").first()).toHaveText(
    "Настройка сохранена",
  );
  await context.setOffline(true);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Поиск задач", exact: true });
  await search.getByLabel("Поиск по тексту", { exact: true }).fill("маркер");
  await expect(search.getByRole("listitem")).toHaveCount(3);
  await expect(search).toContainText("2040-01-01");
  await expect(search).toContainText("Личное");
  await expect(search).toContainText("Идеи");
  await expect(search).toContainText("Выполнена");
  await search.getByLabel("Включать выполненные", { exact: true }).uncheck();
  await expect(search.getByRole("listitem")).toHaveCount(2);
  await search
    .getByLabel("Поиск по тексту", { exact: true })
    .fill("отсутствует");
  await expect(search).toContainText("Ничего не найдено");
  expect(requests).toEqual([]);
});
