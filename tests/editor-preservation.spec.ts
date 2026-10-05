import { test, expect } from "@playwright/test";

test("обновление схемы и правки сохраняют размещение, порядок и неизвестные поля задачи", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.route("**/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Fixture</title>",
    }),
  );
  await page.goto("/");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yourweek", 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          const tasks = database.createObjectStore("tasks", { keyPath: "id" });
          tasks.createIndex("date", "placement.date");
          tasks.add({
            id: "historical-task",
            title: "История",
            completed: false,
            placement: { date: "2026-10-05" },
            order: 9,
            checklist: [
              { id: "step-1", text: "Шаг", completed: true, order: 0 },
            ],
            provenance: { recordNumber: 27, fields: { Task: " История " } },
          });
          database.createObjectStore("lists", { keyPath: "id" });
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      }),
  );
  await page.unroute("**/");
  await page.reload();
  await page.getByRole("button", { name: "История", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("Новая история");
  await dialog
    .getByRole("textbox", { name: "Заметка" })
    .fill("Рабочая заметка");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("checkbox", { name: "Выполнена: Новая история", exact: true })
    .check();
  await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
  const stored = await page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const opening = indexedDB.open("yourweek");
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction("tasks", "readonly");
          const request = transaction
            .objectStore("tasks")
            .get("historical-task");
          transaction.oncomplete = () => {
            database.close();
            resolve(request.result);
          };
          transaction.onabort = () => reject(transaction.error);
        };
        opening.onerror = () => reject(opening.error);
      }),
  );
  expect(stored).toEqual({
    id: "historical-task",
    title: "Новая история",
    notes: "Рабочая заметка",
    color: undefined,
    completed: true,
    placement: { date: "2026-10-05" },
    order: 9,
    checklist: [{ id: "step-1", text: "Шаг", completed: true, order: 0 }],
    provenance: { recordNumber: 27, fields: { Task: " История " } },
  });
  await page
    .getByRole("button", { name: "Новая история", exact: true })
    .click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Удалить задачу" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Новая история", exact: true }),
  ).toHaveCount(0);
});
