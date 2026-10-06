import { test, expect } from "@playwright/test";

const header = "Date,Task,Notes,Checklist,Completed,List";

test("просроченные — только невыполненные с датой раньше локального сегодня; сегодня и задачи без даты исключены", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-06T00:30:00+03:00"));
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "overdue.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `${header}\n2026-10-05,Вчера маркер,,,FALSE,\n2026-10-06,Сегодня маркер,,,FALSE,\n2026-10-07,Завтра маркер,,,FALSE,\n2026-10-04,Завершено маркер,,,TRUE,\n,Без даты маркер,,,FALSE,Идеи\n2020-01-01,Давно,,,FALSE,`,
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
  await expect(search.getByRole("listitem")).toHaveCount(2);
  await expect(search.getByRole("listitem").first()).toContainText("Давно");
  await search.getByLabel("Поиск по тексту", { exact: true }).fill("маркер");
  await expect(search.getByRole("listitem")).toHaveCount(1);
  await expect(search).toContainText("Найдено: 1");
  await search.getByLabel("Просроченные", { exact: true }).uncheck();
  await expect(search.getByRole("listitem")).toHaveCount(5);
  await expect(
    search.getByRole("listitem").filter({ hasText: "Вчера маркер" }),
  ).toContainText("2026-10-05");
  await expect(
    search.getByRole("listitem").filter({ hasText: "Завершено маркер" }),
  ).toContainText("Выполнена");
  await expect(
    search.getByRole("listitem").filter({ hasText: "Без даты маркер" }),
  ).toContainText("Идеи");
  await expect(
    search.getByLabel("Поиск по тексту", { exact: true }),
  ).toHaveValue("маркер");
});

// Размещение (дата/список) в React-редакторе появилось в №05; здесь
// проверяется перенос просроченной задачи через него.
test("перенос просроченной задачи на сегодня через редактор убирает её из просроченных", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-06T00:30:00+03:00"));
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "overdue-move.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `${header}\n2026-10-05,Вчера маркер,,,FALSE,\n2026-10-06,Сегодня маркер,,,FALSE,`,
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
  await search.getByLabel("Поиск по тексту", { exact: true }).fill("маркер");
  await expect(search.getByRole("listitem")).toHaveCount(1);
  await search
    .getByRole("button", { name: "Вчера маркер", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await expect(editor.getByLabel("Размещение", { exact: true })).toHaveCount(1);
  await editor.getByLabel("Дата задачи", { exact: true }).fill("2026-10-06");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    search.getByLabel("Поиск по тексту", { exact: true }),
  ).toHaveValue("маркер");
  await expect(search).toContainText("Ничего не найдено");
  await search.getByLabel("Просроченные", { exact: true }).uncheck();
  await expect(search.getByRole("listitem")).toHaveCount(2);
  await expect(
    search.getByRole("listitem").filter({ hasText: "Вчера маркер" }),
  ).toContainText("2026-10-06");
});
