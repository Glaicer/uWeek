import { test, expect } from "@playwright/test";

test("создаёт задачу в выбранном дне и сохраняет после перезагрузки", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "5 октября 2026 – 11 октября 2026" }),
  ).toBeVisible();
  const monday = page.getByRole("region", { name: "понедельник, 5 октября" });
  await expect(monday.getByText("Сегодня", { exact: true })).toBeVisible();
  const input = monday.getByRole("textbox");
  await input.fill("  Купить хлеб  ");
  await input.press("Enter");
  await expect(monday.getByRole("listitem").locator(".task-title")).toHaveText(
    "Купить хлеб",
  );
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await page.reload();
  await expect(monday.getByRole("listitem").locator(".task-title")).toHaveText(
    "Купить хлеб",
  );
});
