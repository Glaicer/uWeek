import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("старый некорректный пункт чек-листа не удаляется и исправляется в редакторе", async ({
  page,
}) => {
  await page.goto("/");
  const input = page
    .locator(".day")
    .first()
    .getByRole("textbox", { name: /Новая задача/ });
  await input.fill("Legacy task");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("yourweek");
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction("tasks", "readwrite");
        const store = transaction.objectStore("tasks");
        const read = store.getAll();
        read.onsuccess = () =>
          store.put({
            ...read.result[0],
            color: undefined,
            notes: "Keep private content",
            checklist: [
              { id: "legacy-item", text: "   ", completed: true, order: 0 },
            ],
          });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onabort = () => reject(transaction.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Скачать резервную копию", exact: true })
    .click();
  await expect(page.locator(".feedback")).toContainText("Legacy task");
  await expect(page.locator(".feedback")).toContainText("пункт 1");
  await page.reload();
  await page.getByRole("button", { name: "Legacy task", exact: true }).click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByLabel("Заметка", { exact: true })).toHaveValue(
    "Keep private content",
  );
  await expect(
    editor.getByLabel("Текст пункта 1", { exact: true }),
  ).toHaveValue("   ");
  await expect(
    editor.getByLabel("Выполнен пункт 1", { exact: true }),
  ).toBeChecked();
  await editor
    .getByLabel("Текст пункта 1", { exact: true })
    .fill("Repaired item");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать резервную копию", exact: true })
    .click();
  const backup = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(backup.tasks[0].checklist).toEqual([
    { id: "legacy-item", text: "Repaired item", completed: true, order: 0 },
  ]);
  expect(backup.tasks[0].notes).toBe("Keep private content");
  expect(backup.tasks[0].color).toBeUndefined();
});
