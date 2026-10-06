import { test, expect } from "@playwright/test";

test("навигация сохраняет выбранную неделю и не меняет задачи", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await input.fill("План на понедельник");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await page.getByRole("button", { name: "Предыдущая неделя" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "28 сентября 2026 – 4 октября 2026",
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "28 сентября 2026 – 4 октября 2026",
  );
  await page.getByRole("button", { name: "Следующая неделя" }).click();
  await expect(page.getByRole("listitem").locator(".task-title")).toHaveText(
    "План на понедельник",
  );
});

test("начало недели сохраняется, даты переходят через год, високосный день и 2040", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  await page.getByLabel("Перейти к дате").fill("2027-01-01");
  await page.getByRole("button", { name: "Перейти", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "28 декабря 2026 – 3 января 2027",
  );
  await page.getByLabel("Начало недели").selectOption("0");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "27 декабря 2026 – 2 января 2027",
  );
  await page.reload();
  await expect(page.getByLabel("Начало недели")).toHaveValue("0");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "27 декабря 2026 – 2 января 2027",
  );
  await page.getByLabel("Начало недели").selectOption("1");
  await page.getByLabel("Перейти к дате").fill("2028-02-29");
  await page.getByRole("button", { name: "Перейти", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "28 февраля 2028 – 5 марта 2028",
  );
  await expect(
    page.getByRole("region", { name: "вторник, 29 февраля" }),
  ).toBeVisible();
  await page.getByLabel("Перейти к дате").fill("2040-01-01");
  await page.getByLabel("Перейти к дате").press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "26 декабря 2039 – 1 января 2040",
  );
  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00+03:00"));
  await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "12 октября 2026 – 18 октября 2026",
  );
  await expect(
    page
      .getByRole("region", { name: "воскресенье, 18 октября" })
      .getByText("Сегодня", { exact: true }),
  ).toBeVisible();
});
