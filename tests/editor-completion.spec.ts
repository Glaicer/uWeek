import { test, expect } from "@playwright/test";

test("выполнение и фильтр сохраняются без изменения порядка, удаление требует подтверждения", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const monday = page.getByRole("region", { name: "понедельник, 5 октября" });
  for (const title of ["Первая", "Вторая", "Третья"]) {
    await monday.getByRole("textbox").fill(title);
    await monday.getByRole("textbox").press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  }
  await monday
    .getByRole("checkbox", { name: "Выполнена: Вторая", exact: true })
    .check();
  await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
  const filter = page.getByRole("checkbox", { name: "Скрыть выполненные" });
  await filter.check();
  await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
  await expect(monday.getByRole("listitem")).toHaveText(["Первая", "Третья"]);
  await page.reload();
  await expect(filter).toBeChecked();
  await expect(monday.getByRole("listitem")).toHaveText(["Первая", "Третья"]);
  await filter.uncheck();
  await expect(monday.getByRole("listitem")).toHaveText([
    "Первая",
    "Вторая",
    "Третья",
  ]);
  await expect(
    monday.getByRole("checkbox", { name: "Выполнена: Вторая", exact: true }),
  ).toBeChecked();
  await monday
    .getByRole("checkbox", { name: "Выполнена: Вторая", exact: true })
    .uncheck();
  await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
  await page.getByRole("button", { name: "Вторая", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", { name: "Выполнена", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    monday.getByRole("checkbox", { name: "Выполнена: Вторая", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Вторая", exact: true }).click();
  page.once("dialog", async (confirmation) => {
    expect(confirmation.message()).toContain("Вторая");
    await confirmation.dismiss();
  });
  await dialog.getByRole("button", { name: "Удалить задачу" }).click();
  await expect(dialog).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Удалить задачу" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(filter).toBeFocused();
  await page.reload();
  await expect(monday.getByRole("listitem")).toHaveText(["Первая", "Третья"]);
});
