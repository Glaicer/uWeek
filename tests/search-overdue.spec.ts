import { test, expect } from "@playwright/test";

test("rollover removes unfinished past tasks from overdue search and preserves completed/list/future placements", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-06T00:30:00+03:00"));
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "overdue.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Task,Notes,Checklist,Completed,List\n2026-10-05,Вчера маркер,,,FALSE,\n2026-10-06,Сегодня маркер,,,FALSE,\n2026-10-07,Завтра маркер,,,FALSE,\n2026-10-04,Завершено маркер,,,TRUE,\n,Без даты маркер,,,FALSE,Идеи\n2020-01-01,Давно,,,FALSE,",
    ),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить импорт" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Поиск задач" });
  await search.getByLabel("Просроченные", { exact: true }).check();
  await expect(search).toContainText("Ничего не найдено");
  await search.getByLabel("Поиск по тексту", { exact: true }).fill("маркер");
  await search.getByLabel("Просроченные", { exact: true }).uncheck();
  await expect(search.getByRole("listitem")).toHaveCount(5);
  await expect(
    search.getByRole("listitem").filter({ hasText: "Вчера маркер" }),
  ).toContainText("2026-10-06");
  await expect(
    search.getByRole("listitem").filter({ hasText: "Завтра маркер" }),
  ).toContainText("2026-10-07");
  await expect(
    search.getByRole("listitem").filter({ hasText: "Завершено маркер" }),
  ).toContainText("2026-10-04");
  await expect(
    search.getByRole("listitem").filter({ hasText: "Без даты маркер" }),
  ).toContainText("Идеи");
  await search
    .getByRole("button", { name: "Вчера маркер", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await editor.getByLabel("Дата задачи", { exact: true }).fill("2026-10-07");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    search.getByLabel("Поиск по тексту", { exact: true }),
  ).toHaveValue("маркер");
  await search.getByLabel("Просроченные", { exact: true }).check();
  await expect(search).toContainText("Ничего не найдено");
  await search.getByLabel("Просроченные", { exact: true }).uncheck();
  await expect(search.getByRole("listitem")).toHaveCount(5);
  await expect(
    search.getByRole("listitem").filter({ hasText: "Вчера маркер" }),
  ).toContainText("2026-10-07");
});
