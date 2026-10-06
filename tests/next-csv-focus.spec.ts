import { test, expect } from "@playwright/test";

const header = "Date,Task,Notes,Checklist,Completed,List";
const file = {
  name: "focus.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(`${header}\n2026-10-05,Focus,,,FALSE,`),
};

test("preview keeps keyboard focus inside the dialog and returns it to the file input", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  const cancel = dialog.getByRole("button", { name: "Отмена", exact: true });
  const confirm = dialog.getByRole("button", { name: "Подтвердить импорт" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Tweek CSV")).toBeFocused();
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  await expect(dialog).toBeVisible();
  await confirm.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 1" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tweek CSV")).toBeFocused();
});

test("preview stays usable at 360 px width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Подтвердить импорт" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Отмена", exact: true }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});

test("adjacent re-renders keep the preview open and never confirm the import", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  await day.getByRole("textbox").fill("Своя задача");
  await day.getByRole("textbox").press("Enter");
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(dialog).toContainText("Задач: 1");
  await page.evaluate(() => {
    document.querySelector<HTMLInputElement>(".hide-completed input")!.click();
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Настройка сохранена" }),
  ).toBeVisible();
  await expect(dialog).toContainText("Задач: 1");
  await expect(
    page.getByRole("button", { name: "Focus", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Focus", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Своя задача", exact: true }),
  ).toHaveCount(1);
});
