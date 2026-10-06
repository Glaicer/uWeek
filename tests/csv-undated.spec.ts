import { test, expect } from "@playwright/test";

const header = "Date,Task,Notes,Checklist,Completed,List";
const file = (rows: string) => ({
  name: "undated.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(`${header}\n${rows}`),
});

test("mixed preview names undated destinations and new lists; cancellation writes nothing", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Tweek CSV")
    .setInputFiles(
      file(
        "2026-10-05,Dated,,,FALSE,\n,Named,,,TRUE,  работа  \n,Default,,,FALSE,\n,Existing,,,FALSE,  иДеИ  ",
      ),
    );
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Задач: 4");
  await expect(dialog).toContainText("Без даты: 3");
  await expect(dialog).toContainText("Создаваемые списки: работа");
  await expect(dialog).toContainText("Без даты — работа — Named");
  await expect(dialog).toContainText("Без даты — Входящие — Default");
  await expect(dialog).toContainText("Диапазон дат: 2026-10-05 — 2026-10-05");
  await expect(
    page.getByRole("region", { name: "Список: работа", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Когда-нибудь", exact: true })
      .getByRole("heading", { level: 3 }),
  ).toHaveText(["Входящие", "Личное", "Идеи"]);
  await expect(
    page.getByRole("button", { name: "Default", exact: true }),
  ).toHaveCount(0);
});

test("confirmed mixed import appends duplicates to normalized lists, survives reopen and repeats safely", async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const ideas = page.getByRole("region", { name: "Список: Идеи", exact: true });
  await ideas
    .getByRole("textbox", { name: "Новая задача: Идеи" })
    .fill("Existing idea");
  await ideas
    .getByRole("textbox", { name: "Новая задача: Идеи" })
    .press("Enter");
  const input = file(
    "2026-10-05,Dated,,,FALSE,\n,  Duplicate  ,Original,,TRUE,  иДеИ  \n\n,  Duplicate  ,Original,,TRUE,  иДеИ  \n,New one,,,FALSE,  Работа  \n,New two,,,FALSE,рАБОТА\n,Default,,,FALSE,   ",
  );
  await page.getByLabel("Tweek CSV").setInputFiles(input);
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(dialog).toContainText("Точные повторные вхождения: 1");
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 6" }),
  ).toBeVisible();
  await expect(ideas.getByRole("listitem").locator(".task-title")).toHaveText([
    "Existing idea",
    "Duplicate",
    "Duplicate",
  ]);
  await expect(
    ideas
      .getByRole("checkbox", { name: "Выполнена: Duplicate", exact: true })
      .first(),
  ).toBeChecked();
  await expect(
    page
      .getByRole("region", { name: "Список: Работа", exact: true })
      .getByRole("listitem")
      .locator(".task-title"),
  ).toHaveText(["New one", "New two"]);
  await expect(
    page
      .getByRole("region", { name: "Список: Входящие", exact: true })
      .getByRole("listitem")
      .locator(".task-title"),
  ).toHaveText("Default");
  await expect(
    page.getByRole("button", { name: "Dated", exact: true }),
  ).toBeVisible();
  const url = page.url();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await expect(
    reopened
      .getByRole("region", { name: "Список: Идеи", exact: true })
      .getByRole("listitem")
      .locator(".task-title"),
  ).toHaveText(["Existing idea", "Duplicate", "Duplicate"]);
  await reopened.getByLabel("Tweek CSV").setInputFiles(input);
  await reopened
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить импорт" })
    .click();
  await expect(
    reopened.getByRole("status").filter({ hasText: "Добавлено задач: 0" }),
  ).toBeVisible();
  await expect(
    reopened
      .getByRole("region", { name: "Когда-нибудь", exact: true })
      .getByRole("heading", { level: 3 }),
  ).toHaveText(["Входящие", "Личное", "Идеи", "Работа"]);
  await expect(
    reopened
      .getByRole("region", { name: "Список: Работа", exact: true })
      .getByRole("listitem")
      .locator(".task-title"),
  ).toHaveText(["New one", "New two"]);
});
