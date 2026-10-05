import { test, expect } from "@playwright/test";

const header = "Date,Task,Notes,Checklist,Completed,List";

test("preview is read-only; confirmation appends every occurrence and repeat bytes add nothing", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const csv = `${header}\n2026-10-05,  Импорт ✨  ,"<p>text</p>\nnext",, TRUE ,\n\n2026-10-05,  Импорт ✨  ,"<p>text</p>\nnext",, TRUE ,`;
  const file = {
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  };
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(dialog).toContainText("Задач: 2");
  await expect(dialog).toContainText("Точные повторные вхождения: 1");
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Импорт ✨", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 2" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Импорт ✨", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Импорт ✨", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Заметка", { exact: true })).toHaveValue(
    "<p>text</p>\nnext",
  );
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page
    .getByLabel("Tweek CSV")
    .setInputFiles({ ...file, name: "renamed.csv" });
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 0" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Импорт ✨", exact: true }),
  ).toHaveCount(2);
});
