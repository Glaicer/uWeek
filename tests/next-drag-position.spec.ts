import { test, expect, type Page, type Locator } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
});

async function add(page: Page, section: Locator, titles: string[]) {
  for (const title of titles) {
    const input = section.getByRole("textbox", { name: /Новая задача/ });
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  }
}

async function drop(source: Locator, target: Locator, after = false) {
  const bounds = (await target.boundingBox())!;
  await source.dragTo(target, {
    targetPosition: {
      x: bounds.width / 2,
      y: bounds.height * (after ? 0.8 : 0.2),
    },
  });
}

test("cross-container positional drop is atomic, keeps hidden slots and allows retry", async ({
  page,
}) => {
  await page.goto("/");
  const source = page.locator(".day").first();
  const target = page.locator(".day").nth(1);
  await add(page, source, ["Перенос", "Осталась"]);
  await add(page, target, ["Первый", "Скрытый", "Последний"]);
  await target
    .getByRole("checkbox", { name: "Выполнена: Скрытый", exact: true })
    .check();
  await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
  await page
    .getByRole("checkbox", { name: "Скрыть выполненные", exact: true })
    .check();
  await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
  const id = await source
    .locator(".task-row")
    .first()
    .getAttribute("data-task-id");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.put = original;
      return request;
    };
  });
  await drop(
    source.getByRole("button", { name: "Перенос", exact: true }),
    target.locator(".task-row").filter({ hasText: "Первый" }),
  );
  await expect(page.getByRole("status")).toHaveText(
    "Перемещение не сохранено. Повторите действие.",
  );
  await expect(source.locator(".task-title")).toHaveText([
    "Перенос",
    "Осталась",
  ]);
  await expect(
    target.locator(".task-row:not([hidden]) .task-title"),
  ).toHaveText(["Первый", "Последний"]);
  await page.reload();
  await expect(source.locator(".task-title")).toHaveText([
    "Перенос",
    "Осталась",
  ]);
  await drop(
    source.getByRole("button", { name: "Перенос", exact: true }),
    target.locator(".task-row").filter({ hasText: "Первый" }),
  );
  await expect(page.getByRole("status")).toHaveText("Перемещение сохранено");
  await expect(source.locator(".task-title")).toHaveText(["Осталась"]);
  await expect(
    target.locator(".task-row:not([hidden]) .task-title"),
  ).toHaveText(["Перенос", "Первый", "Последний"]);
  await expect(target.locator(`[data-task-id="${id}"] .task-title`)).toHaveText(
    "Перенос",
  );
  await page.reload();
  await page
    .getByRole("checkbox", { name: "Скрыть выполненные", exact: true })
    .uncheck();
  await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
  await expect(target.locator(".task-title")).toHaveText([
    "Перенос",
    "Скрытый",
    "Первый",
    "Последний",
  ]);
  await expect(
    target.getByRole("checkbox", { name: "Выполнена: Скрытый", exact: true }),
  ).toBeChecked();
});
