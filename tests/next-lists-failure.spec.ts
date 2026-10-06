import { test, expect } from "@playwright/test";

test("отменённая транзакция списка и задачи не показывает успех и сохраняет ввод для повтора", async ({
  page,
}) => {
  await page.goto("/");
  const newList = page.getByRole("textbox", { name: "Название нового списка" });
  await newList.fill("Черновой список");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.put = original;
      return request;
    };
  });
  await newList.press("Enter");
  await expect(page.getByRole("status")).toContainText("Список не сохранён");
  await expect(newList).toHaveValue("Черновой список");
  await expect(
    page.getByRole("heading", { name: "Черновой список", exact: true }),
  ).toHaveCount(0);
  await newList.press("Enter");
  const list = page.getByRole("region", {
    name: "Список: Черновой список",
    exact: true,
  });
  const input = list.getByRole("textbox", {
    name: "Новая задача: Черновой список",
  });
  await input.fill("Несохранённая идея");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.add = original;
      return request;
    };
  });
  await input.press("Enter");
  await expect(page.getByRole("status")).toContainText("Задача не сохранена");
  await expect(input).toHaveValue("Несохранённая идея");
  await expect(list.getByRole("listitem")).toHaveCount(0);
  await input.press("Enter");
  await expect(list.getByRole("listitem").locator(".task-title")).toHaveText(
    "Несохранённая идея",
  );
  await page.reload();
  await expect(list.getByRole("listitem").locator(".task-title")).toHaveText(
    "Несохранённая идея",
  );
});

test("списки и действия доступны на экране 360px без горизонтальной прокрутки", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Название нового списка" });
  await input.fill("Оченьдлинноеназваниесписка".repeat(5));
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Список сохранён");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
