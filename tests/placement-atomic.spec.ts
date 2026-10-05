import { test, expect } from "@playwright/test";

test("aborted placement save leaves source and full draft intact for retry", async ({
  page,
}) => {
  await page.goto("/");
  const source = page.locator(".day").first();
  await source
    .getByRole("textbox", { name: /Новая задача/ })
    .fill("До переноса");
  await source.getByRole("textbox", { name: /Новая задача/ }).press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await source
    .getByRole("button", { name: "До переноса", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Размещение", { exact: true }).selectOption("list");
  await editor
    .getByLabel("Список задачи", { exact: true })
    .selectOption({ label: "Личное" });
  await editor
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("После переноса");
  await editor.getByRole("button", { name: "Добавить пункт" }).click();
  await editor
    .getByRole("textbox", { name: "Текст пункта 1", exact: true })
    .fill("Черновик шага");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.put = original;
      return request;
    };
  });
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "Изменения не сохранены",
  );
  await expect(
    editor.getByRole("textbox", { name: "Текст пункта 1", exact: true }),
  ).toHaveValue("Черновик шага");
  await expect(source.locator(".task-title")).toHaveText(["До переноса"]);
  const destination = page.getByRole("region", {
    name: "Список: Личное",
    exact: true,
  });
  await expect(destination.locator(".task-row")).toHaveCount(0);
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(source.locator(".task-row")).toHaveCount(0);
  await expect(destination.locator(".task-title")).toHaveText([
    "После переноса",
  ]);
  await page.reload();
  await destination
    .getByRole("button", { name: "После переноса", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Текст пункта 1", exact: true }),
  ).toHaveValue("Черновик шага");
});

test("aborted reorder never announces or renders a successful new order", async ({
  page,
}) => {
  await page.goto("/");
  const section = page.locator(".day").first();
  for (const title of ["Первый", "Второй"]) {
    const input = section.getByRole("textbox", { name: /Новая задача/ });
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  }
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
  });
  await section
    .getByRole("button", { name: "Ниже: Первый", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Порядок не сохранён. Повторите действие.",
  );
  await expect(section.locator(".task-title")).toHaveText(["Первый", "Второй"]);
  await page.reload();
  await expect(section.locator(".task-title")).toHaveText(["Первый", "Второй"]);
});
