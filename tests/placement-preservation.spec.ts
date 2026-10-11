import { test, expect } from "@playwright/test";

test("new placement appends after maximum including hidden tasks and preserves extended records/settings", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  const date = await page
    .getByLabel("Перейти к дате", { exact: true })
    .inputValue();
  const provenance = {
    fingerprint: "a".repeat(64),
    recordNumber: 2,
    fields: {
      Task: "Исходная задача",
      Date: date,
      Completed: "false",
      Notes: "Исходная заметка",
      Color: "",
      List: "",
    },
  };
  await page.evaluate(
    async ({ date, provenance }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("yourweek");
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            ["tasks", "lists", "settings"],
            "readwrite",
          );
          const lists = transaction.objectStore("lists").getAll();
          lists.onsuccess = () => {
            const listId = lists.result.find(
              (list: { title: string }) => list.title === "Личное",
            ).id;
            const tasks = transaction.objectStore("tasks");
            tasks.put({
              id: "moving",
              title: "Перенос с данными",
              completed: true,
              placement: { date },
              order: 30,
              notes: "Заметка",
              color: "blue",
              checklist: [
                { id: "step", text: "Шаг", completed: false, order: 0 },
              ],
              provenance,
              futureField: { keep: "не терять" },
            });
            tasks.put({
              id: "tail",
              title: "Скрытый хвост",
              completed: true,
              placement: { listId },
              order: 900,
            });
            tasks.put({
              id: "day-tail",
              title: "Дневной хвост",
              completed: true,
              placement: { date: "1999-12-31" },
              order: 700,
            });
            transaction
              .objectStore("settings")
              .put({ weekStartsOn: 1, futureSetting: "не терять" }, "planner");
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => reject(transaction.error);
        };
        open.onerror = () => reject(open.error);
      });
    },
    { date, provenance },
  );
  await page.reload();
  const editor = page.getByRole("dialog");
  await page
    .getByRole("button", { name: "Перенос с данными", exact: true })
    .click();
  await editor.getByLabel("Размещение", { exact: true }).selectOption("list");
  await editor
    .getByLabel("Список задачи", { exact: true })
    .selectOption({ label: "Личное" });
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Список: Личное", exact: true })
      .locator(".task-title"),
  ).toHaveText(["Скрытый хвост", "Перенос с данными"]);
  const snapshot = async () =>
    page.evaluate(async () => {
      return await new Promise<{
        tasks: Record<string, unknown>[];
        settings: unknown;
      }>((resolve, reject) => {
        const open = indexedDB.open("yourweek");
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            ["tasks", "settings"],
            "readonly",
          );
          const tasks = transaction.objectStore("tasks").getAll();
          const settings = transaction.objectStore("settings").get("planner");
          transaction.oncomplete = () => {
            resolve({ tasks: tasks.result, settings: settings.result });
            database.close();
          };
          transaction.onabort = () => reject(transaction.error);
        };
        open.onerror = () => reject(open.error);
      });
    });
  const listSnapshot = await snapshot();
  expect(listSnapshot.tasks.find((task) => task.id === "moving")?.order).toBe(
    901,
  );
  await page
    .getByRole("button", { name: "Перенос с данными", exact: true })
    .click();
  await editor.getByLabel("Размещение", { exact: true }).selectOption("date");
  await editor.getByLabel("Дата задачи", { exact: true }).fill("1999-12-31");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const state = await snapshot();
  expect(state.tasks).toHaveLength(3);
  expect(state.tasks.find((task) => task.id === "moving")).toMatchObject({
    id: "moving",
    completed: true,
    placement: { date: "1999-12-31" },
    order: 701,
    notes: "Заметка",
    color: "blue",
    checklist: [{ id: "step", text: "Шаг", completed: false, order: 0 }],
    provenance,
    futureField: { keep: "не терять" },
  });
  expect(state.tasks.find((task) => task.id === "tail")).toEqual(
    listSnapshot.tasks.find((task) => task.id === "tail"),
  );
  expect(state.tasks.find((task) => task.id === "day-tail")).toEqual(
    listSnapshot.tasks.find((task) => task.id === "day-tail"),
  );
  expect(state.settings).toEqual({
    weekStartsOn: 1,
    futureSetting: "не терять",
  });
  const storageState = await page.context().storageState({ indexedDB: true });
  const otherTimezone = await browser.newContext({
    storageState,
    timezoneId: "America/Los_Angeles",
  });
  try {
    const reopened = await otherTimezone.newPage();
    await reopened.goto(page.url());
    await reopened
      .getByLabel("Перейти к дате", { exact: true })
      .fill("1999-12-31");
    await reopened
      .getByRole("button", { name: "Перейти", exact: true })
      .click();
    await reopened
      .getByRole("button", { name: "Перенос с данными", exact: true })
      .click();
    await expect(
      reopened.getByRole("dialog").getByLabel("Дата задачи", { exact: true }),
    ).toHaveValue("1999-12-31");
  } finally {
    await otherTimezone.close();
  }
});
