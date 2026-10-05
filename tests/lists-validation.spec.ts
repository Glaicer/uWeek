import { test, expect } from "@playwright/test";

test("пустые названия запрещены, регистр собственного имени допустим, Escape отменяет переименование", async ({
  page,
}) => {
  await page.goto("/");
  const create = page.getByRole("textbox", { name: "Название нового списка" });
  await create.fill("   ");
  await create.press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "Введите непустое название списка",
  );
  await expect(page.locator(".lists h3")).toHaveCount(3);
  const inbox = page.getByRole("region", {
    name: "Список: Входящие",
    exact: true,
  });
  const rename = inbox.getByRole("textbox", {
    name: "Название списка",
    exact: true,
  });
  await expect(rename).toBeHidden();
  await inbox.getByRole("button", { name: "Переименовать список" }).click();
  await rename.fill("   ");
  await rename.press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "Введите непустое название списка",
  );
  await expect(rename).toBeVisible();
  await rename.fill("Другое имя");
  await rename.press("Escape");
  await expect(rename).toBeHidden();
  await expect(
    inbox.getByRole("button", { name: "Переименовать список" }),
  ).toBeFocused();
  await inbox.getByRole("button", { name: "Переименовать список" }).click();
  await expect(rename).toHaveValue("Входящие");
  await rename.fill("  ВХОДЯЩИЕ  ");
  await rename.press("Enter");
  await expect(
    page.getByRole("region", { name: "Список: ВХОДЯЩИЕ", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".lists h3")).toHaveText([
    "ВХОДЯЩИЕ",
    "Личное",
    "Идеи",
  ]);
});

test("отмена записи переименования и удаления оставляет сохранённый список и черновик", async ({
  page,
}) => {
  await page.goto("/");
  const ideas = page.getByRole("region", { name: "Список: Идеи", exact: true });
  await ideas.getByRole("button", { name: "Переименовать список" }).click();
  const input = ideas.getByRole("textbox", {
    name: "Название списка",
    exact: true,
  });
  await input.fill("Новые идеи");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.put = original;
      return request;
    };
  });
  await input.press("Enter");
  await expect(page.getByRole("status")).toContainText("Название не сохранено");
  await expect(ideas.getByRole("heading")).toHaveText("Идеи");
  await expect(input).toHaveValue("Новые идеи");
  await input.press("Enter");
  const renamed = page.getByRole("region", {
    name: "Список: Новые идеи",
    exact: true,
  });
  await expect(renamed).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.delete = original;
      return request;
    };
  });
  await renamed
    .getByRole("button", { name: "Удалить список", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Список не удалён");
  await page.reload();
  await expect(renamed).toBeVisible();
});
