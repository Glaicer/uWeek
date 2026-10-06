import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
});

test("placement rejects empty date and a deleted destination list without moving or losing the draft", async ({
  page,
}) => {
  await page.goto("/");
  const source = page.locator(".day").first();
  const input = source.getByRole("textbox", { name: /Новая задача/ });
  await input.fill("Проверка размещения");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await source
    .getByRole("button", { name: "Проверка размещения", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Дата задачи", { exact: true }).fill("");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(source.locator(".task-title")).toHaveText([
    "Проверка размещения",
  ]);
  await editor.getByLabel("Размещение", { exact: true }).selectOption("list");
  await editor
    .getByLabel("Список задачи", { exact: true })
    .selectOption({ label: "Личное" });
  const listId = await editor
    .getByLabel("Список задачи", { exact: true })
    .inputValue();
  await page.evaluate(async (listId) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("yourweek");
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction("lists", "readwrite");
        transaction.objectStore("lists").delete(listId);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onabort = () => reject(transaction.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, listId);
  await editor
    .getByRole("textbox", { name: "Заметка", exact: true })
    .fill("Сохранить черновик");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "Изменения не сохранены",
  );
  await expect(
    editor.getByRole("textbox", { name: "Заметка", exact: true }),
  ).toHaveValue("Сохранить черновик");
  await expect(source.locator(".task-title")).toHaveText([
    "Проверка размещения",
  ]);
  await page.reload();
  await expect(source.locator(".task-title")).toHaveText([
    "Проверка размещения",
  ]);
});
