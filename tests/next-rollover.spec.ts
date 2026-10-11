import { test, expect, type Page } from "@playwright/test";
import type { Task } from "../src/model";

async function tasks(page: Page): Promise<Task[]> {
  return page.evaluate(async () => {
    return new Promise<Task[]>((resolve, reject) => {
      const open = indexedDB.open("yourweek");
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction("tasks", "readonly");
        const request = transaction.objectStore("tasks").getAll();
        transaction.oncomplete = () => {
          database.close();
          resolve(request.result);
        };
        transaction.onabort = () => reject(transaction.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
}

test("reopening catches up missed days, appends in date/order order and preserves task data", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2027-01-01T00:30:00+03:00"));
  await page.route("**/*", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await page.goto("/");
  const listId = "seeded-list";
  const original: Task[] = [
    {
      id: "old",
      title: "Незавершённая задача",
      completed: false,
      placement: { date: "2026-12-20" },
      order: 7,
      notes: "Сохранить заметку",
      color: "blue",
      checklist: [{ id: "step", text: "Шаг", completed: true, order: 0 }],
      provenance: {
        fingerprint: "a".repeat(64),
        recordNumber: 2,
        fields: {
          Date: "2026-12-20",
          Task: "Исходная задача",
          Notes: "",
          Checklist: "",
          Completed: "FALSE",
          List: "",
        },
      },
    },
    {
      id: "yesterday",
      title: "Вчерашняя задача",
      completed: false,
      placement: { date: "2026-12-31" },
      order: 0,
    },
    {
      id: "today",
      title: "Сегодняшняя задача",
      completed: false,
      placement: { date: "2027-01-01" },
      order: 2,
    },
    {
      id: "done",
      title: "Выполненная задача",
      completed: true,
      placement: { date: "2026-12-31" },
      order: 1,
    },
    {
      id: "hidden-tail",
      title: "Выполнена сегодня",
      completed: true,
      placement: { date: "2027-01-01" },
      order: 50,
    },
    {
      id: "future",
      title: "Будущая задача",
      completed: false,
      placement: { date: "2027-01-02" },
      order: 0,
    },
    {
      id: "list",
      title: "Без даты",
      completed: false,
      placement: { listId },
      order: 0,
    },
  ];
  await page.evaluate(
    async ({ listId, original }: { listId: string; original: Task[] }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("yourweek", 1);
        request.onupgradeneeded = () => {
          const tasks = request.result.createObjectStore("tasks", {
            keyPath: "id",
          });
          tasks.createIndex("date", "placement.date");
          const lists = request.result.createObjectStore("lists", {
            keyPath: "id",
          });
          lists.add({ id: listId, title: "Мой список", order: 0 });
          for (const task of original) tasks.add(task);
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    },
    { listId, original },
  );
  await page.unroute("**/*");
  await page.reload();
  await expect(
    page.locator('.day[data-date="2027-01-01"] .task-title'),
  ).toHaveText([
    "Сегодняшняя задача",
    "Выполнена сегодня",
    "Незавершённая задача",
    "Вчерашняя задача",
  ]);
  const rolled = await tasks(page);
  expect(rolled).toHaveLength(original.length);
  expect(rolled.find((task) => task.id === "old")).toEqual({
    ...original[0],
    placement: { date: "2027-01-01" },
    order: 51,
  });
  expect(rolled.find((task) => task.id === "yesterday")).toEqual({
    ...original[1],
    placement: { date: "2027-01-01" },
    order: 52,
  });
  for (const task of original.slice(2)) {
    expect(rolled.find((entry) => entry.id === task.id)).toEqual(task);
  }
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await tasks(page)).toEqual(rolled);
});

test("local midnight moves tasks without reloading and leaves an open editor intact", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2028-02-28T23:58:00+03:00") });
  await page.goto("/");
  await page.clock.pauseAt(new Date("2028-02-28T23:59:00+03:00"));
  const input = page
    .locator('.day[data-date="2028-02-28"]')
    .getByRole("textbox");
  await input.fill("Перенести ночью");
  await input.press("Enter");
  await page
    .getByRole("button", { name: "Перенести ночью", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await editor
    .getByLabel("Заметка", { exact: true })
    .fill("Несохранённая заметка");
  await page.clock.runFor(120_000);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Заметка", { exact: true })).toHaveValue(
    "Несохранённая заметка",
  );
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.clock.runFor(60_000);
  await expect(
    page.locator('.day[data-date="2028-02-29"] .task-title'),
  ).toHaveText("Перенести ночью");
  await expect(
    page.locator('.day[data-date="2028-02-28"] .task-title'),
  ).toHaveCount(0);
  expect(await tasks(page)).toMatchObject([
    { placement: { date: "2028-02-29" }, notes: "Несохранённая заметка" },
  ]);
});
