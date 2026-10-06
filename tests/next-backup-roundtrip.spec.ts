import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const newOrigin = "http://127.0.0.1:4213";
const oldOrigin = "http://127.0.0.1:4299";
const fixed = new Date("2026-10-05T12:00:00+03:00");

type AnyBackup = Record<string, unknown> & { exportedAt?: string };

async function download(page: Page): Promise<AnyBackup> {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать резервную копию", exact: true })
    .click();
  const file = await pending;
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}

async function choose(page: Page, backup: unknown) {
  await page.getByLabel("Восстановить JSON").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
}

async function createTask(page: Page, date: string, title: string) {
  const day = page.locator(`.day[data-date="${date}"]`);
  const input = day.getByRole("textbox");
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
}

test("копия контрольной старой версии восстанавливается новой и повторные экспорты совпадают", async ({
  browser,
}) => {
  const context = await browser.newContext({
    timezoneId: "Europe/Moscow",
  });
  const oldPage = await context.newPage();
  await oldPage.clock.setFixedTime(fixed);
  await oldPage.goto(`${oldOrigin}/`);
  await createTask(oldPage, "2026-10-05", "Домашние дела");
  await oldPage
    .getByRole("button", { name: "Домашние дела", exact: true })
    .click();
  const editor = oldPage.getByRole("dialog");
  await editor
    .getByLabel("Заметка", { exact: true })
    .fill("Заметка старой версии");
  await editor
    .getByRole("combobox", { name: "Цвет", exact: true })
    .selectOption("red");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await oldPage.getByLabel("Перейти к дате").fill("2041-02-28");
  await oldPage.getByRole("button", { name: "Перейти", exact: true }).click();
  await createTask(oldPage, "2041-02-28", "Далёкий план");
  await oldPage.getByLabel("Начало недели").selectOption("0");
  await expect(oldPage.getByLabel("Начало недели")).toHaveValue("0");
  const backup = await download(oldPage);
  expect(backup.version).toBe(1);

  const newPage = await context.newPage();
  await newPage.clock.setFixedTime(fixed);
  await newPage.goto(`${newOrigin}/`);
  await choose(newPage, backup);
  const preview = newPage.getByRole("dialog", { name: "Восстановление копии" });
  await expect(preview).toContainText("Задач: 2. Списков: 3.");
  await expect(preview).toContainText("полностью заменены, не объединены");
  await preview.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(newPage.locator(".feedback")).toContainText(
    "Копия восстановлена. Открыта текущая неделя.",
  );
  await expect(
    newPage
      .getByRole("region", { name: "понедельник, 5 октября" })
      .locator(".task-title"),
  ).toHaveText("Домашние дела");
  await expect(
    newPage
      .getByRole("region", { name: "понедельник, 5 октября" })
      .getByRole("listitem"),
  ).toHaveAttribute("data-color", "red");
  await expect(newPage.getByLabel("Начало недели")).toHaveValue("0");
  await newPage.getByLabel("Перейти к дате").fill("2041-02-28");
  await newPage.getByRole("button", { name: "Перейти", exact: true }).click();
  await expect(
    newPage.locator('.day[data-date="2041-02-28"]').locator(".task-title"),
  ).toHaveText("Далёкий план");
  const repeated = await download(newPage);
  delete backup.exportedAt;
  delete repeated.exportedAt;
  expect(repeated).toEqual(backup);
  await context.close();
});

test("копия новой версии восстанавливается контрольной старой версией с чек-листом и цветом", async ({
  browser,
}) => {
  const context = await browser.newContext({
    timezoneId: "Europe/Moscow",
  });
  const newPage = await context.newPage();
  await newPage.clock.setFixedTime(fixed);
  await newPage.goto(`${newOrigin}/`);
  await createTask(newPage, "2026-10-05", "Свежая задача");
  await newPage
    .getByRole("button", { name: "Свежая задача", exact: true })
    .click();
  const editor = newPage.getByRole("dialog");
  await editor
    .getByRole("combobox", { name: "Цвет", exact: true })
    .selectOption("blue");
  await editor
    .getByRole("button", { name: "Добавить пункт", exact: true })
    .click();
  await editor
    .getByLabel("Текст пункта 1", { exact: true })
    .fill("Пункт копии");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await newPage.getByLabel("Перейти к дате").fill("2041-02-28");
  await newPage.getByRole("button", { name: "Перейти", exact: true }).click();
  await createTask(newPage, "2041-02-28", "Новый далёкий план");
  const backup = await download(newPage);

  const oldPage = await context.newPage();
  await oldPage.clock.setFixedTime(fixed);
  await oldPage.goto(`${oldOrigin}/`);
  await choose(oldPage, backup);
  const preview = oldPage.getByRole("dialog", { name: "Восстановление копии" });
  await expect(preview).toContainText("Задач: 2. Списков: 3.");
  await preview.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(oldPage.locator(".feedback")).toContainText(
    "Копия восстановлена. Открыта текущая неделя.",
  );
  const today = oldPage.locator('.day[data-date="2026-10-05"]');
  await expect(today.locator(".task-title")).toHaveText("Свежая задача");
  await expect(today.getByRole("listitem")).toHaveAttribute(
    "data-color",
    "blue",
  );
  await expect(oldPage.getByLabel("Начало недели")).toHaveValue("1");
  await oldPage
    .getByRole("button", { name: "Свежая задача", exact: true })
    .click();
  const oldEditor = oldPage.getByRole("dialog");
  await expect(
    oldEditor.getByLabel("Текст пункта 1", { exact: true }),
  ).toHaveValue("Пункт копии");
  await oldEditor.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(oldEditor).toHaveCount(0);
  const repeated = await download(oldPage);
  delete backup.exportedAt;
  delete repeated.exportedAt;
  expect(repeated).toEqual(backup);
  await context.close();
});
