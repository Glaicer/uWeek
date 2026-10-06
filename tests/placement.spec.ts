import { test, expect } from "@playwright/test";

test("placement draft cancels and moves day → day → list → list → far date, then reopens", async ({
  page,
}) => {
  await page.goto("/");
  const days = page.locator(".day");
  const first = days.nth(0);
  const input = first.getByRole("textbox", { name: /Новая задача/ });
  await input.fill("Переносимый план");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  const id = await first.locator("[data-task-id]").getAttribute("data-task-id");
  await first
    .getByRole("button", { name: "Переносимый план", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  const originalDate = await editor
    .getByLabel("Дата задачи", { exact: true })
    .inputValue();
  const next = new Date(`${originalDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);
  await editor.getByLabel("Дата задачи", { exact: true }).fill(nextDate);
  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(
    first.getByRole("button", { name: "Переносимый план", exact: true }),
  ).toBeVisible();
  await first
    .getByRole("button", { name: "Переносимый план", exact: true })
    .click();
  await editor.getByLabel("Дата задачи", { exact: true }).fill(nextDate);
  await editor
    .getByRole("textbox", { name: "Заметка", exact: true })
    .fill("Заметка при переносе");
  await editor.getByRole("button", { name: "Добавить пункт" }).click();
  await editor
    .getByRole("textbox", { name: "Текст пункта 1", exact: true })
    .fill("Шаг");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(first.locator("[data-task-id]")).toHaveCount(0);
  await expect(days.nth(1).locator("[data-task-id]")).toHaveAttribute(
    "data-task-id",
    id!,
  );
  for (const title of ["Личное", "Идеи"]) {
    await page
      .getByRole("button", { name: "Переносимый план", exact: true })
      .click();
    await editor.getByLabel("Размещение", { exact: true }).selectOption("list");
    await editor
      .getByLabel("Список задачи", { exact: true })
      .selectOption({ label: title });
    await editor
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: `Список: ${title}`, exact: true })
        .locator("[data-task-id]"),
    ).toHaveAttribute("data-task-id", id!);
    await expect(page.locator("[data-task-id]")).toHaveCount(1);
  }
  await page
    .getByRole("button", { name: "Переносимый план", exact: true })
    .click();
  await editor.getByLabel("Размещение", { exact: true }).selectOption("date");
  await editor.getByLabel("Дата задачи", { exact: true }).fill("2040-02-29");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator("[data-task-id]")).toHaveCount(0);
  await page.getByLabel("Перейти к дате", { exact: true }).fill("2040-02-29");
  await page.getByRole("button", { name: "Перейти", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Переносимый план", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Переносимый план", exact: true })
    .click();
  await expect(editor.getByLabel("Дата задачи", { exact: true })).toHaveValue(
    "2040-02-29",
  );
  await expect(
    editor.getByRole("textbox", { name: "Заметка", exact: true }),
  ).toHaveValue("Заметка при переносе");
  await expect(
    editor.getByRole("textbox", { name: "Текст пункта 1", exact: true }),
  ).toHaveValue("Шаг");
});
