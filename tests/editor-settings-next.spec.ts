import { test, expect } from "@playwright/test";

test("фильтр выполнения и начало недели сохраняются независимо друг от друга", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const filter = page.getByRole("checkbox", { name: "Скрыть выполненные" });
  const start = page.getByLabel("Начало недели");
  await filter.check();
  await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
  await start.selectOption("0");
  await expect(
    page.getByRole("heading", { name: "4 октября 2026 – 10 октября 2026" }),
  ).toBeVisible();
  await page.reload();
  await expect(start).toHaveValue("0");
  await expect(filter).toBeChecked();
  await filter.uncheck();
  await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
  await page.reload();
  await expect(start).toHaveValue("0");
  await expect(filter).not.toBeChecked();
});
