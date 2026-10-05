import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
});

test("пустой ввод и Escape не создают задач; новые задачи добавляются в конец", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "вторник, 6 октября" });
  const input = day.getByRole("textbox");
  await input.fill("   ");
  await input.press("Enter");
  await input.fill("Отменённая задача");
  await input.press("Escape");
  await expect(input).toHaveValue("");
  await input.press("Enter");
  await expect(day.getByRole("listitem")).toHaveCount(0);
  for (const title of ["Первая", "Вторая"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(input).toHaveValue("");
  }
  await page.reload();
  await expect(day.getByRole("listitem").locator(".task-title")).toHaveText([
    "Первая",
    "Вторая",
  ]);
  for (const title of ["Входящие", "Личное", "Идеи"]) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
});

test("отмена настоящей транзакции после успеха запроса не сообщает успех и сохраняет черновик для повтора", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  await expect(input).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.add = original;
      return request;
    };
  });
  await input.fill("Не терять черновик");
  await input.press("Enter");
  await expect(page.getByRole("status")).toContainText("Задача не сохранена");
  await expect(input).toHaveValue("Не терять черновик");
  await expect(day.getByRole("listitem")).toHaveCount(0);
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await page.reload();
  await expect(day.getByRole("listitem").locator(".task-title")).toHaveText(
    "Не терять черновик",
  );
});
