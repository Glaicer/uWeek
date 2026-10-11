import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { BackupV1 } from "../src/backup";

const fixture: BackupV1 = {
  format: "yourweek-backup",
  version: 1,
  exportedAt: "2026-10-05T12:00:00.000Z",
  lists: [
    { id: "list-a", title: "Ideas", order: 3 },
    { id: "list-b", title: "Inbox", order: 0 },
  ],
  settings: { weekStartsOn: 0, hideCompleted: true },
  importHistory: [
    {
      fingerprint: "a".repeat(64),
      importedAt: "2026-10-04T11:00:00.000Z",
      addedTasks: 2,
      emptyRecords: 1,
    },
  ],
  tasks: [
    {
      id: "task-a",
      title: "Изменено 🦊",
      completed: true,
      notes: "Private\nnotes",
      color: "purple",
      placement: { date: "2044-02-29" },
      order: 4,
      checklist: [
        { id: "check-a", text: "Done", completed: true, order: 1 },
        { id: "check-b", text: "Pending", completed: false, order: 0 },
      ],
      provenance: {
        fingerprint: "a".repeat(64),
        recordNumber: 2,
        fields: {
          Date: "2026-10-05",
          Task: " Original ",
          Notes: "Original notes",
          Checklist: "",
          Completed: "TRUE",
          List: "",
        },
      },
    },
    {
      id: "task-b",
      title: "Undated",
      completed: false,
      color: "blue",
      placement: { listId: "list-a" },
      order: 7,
    },
    {
      id: "task-c",
      title: "Past",
      // Выполненная, чтобы авто-перенос (ticket 11) не двигал прошлую дату
      // при перезагрузке — иначе сравнение копий после reopen ломалось бы.
      completed: true,
      placement: { date: "2000-01-01" },
      order: 0,
    },
  ],
};

function withoutTime(backup: BackupV1) {
  const data: Partial<BackupV1> = { ...backup };
  delete data.exportedAt;
  return data;
}

const csv =
  "Date,Task,Notes,Checklist,Completed,List\n2041-02-28,Future,Original,,TRUE,\n,Undated,Note,,FALSE,Ideas";

async function download(page: Page) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать резервную копию", exact: true })
    .click();
  const file = await pending;
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}

async function choose(page: Page, backup: unknown) {
  await page.getByLabel("Восстановить JSON").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      typeof backup === "string" ? backup : JSON.stringify(backup),
    ),
  });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
});

test("полная копия переносит все даты, настройки и CSV-историю между чистыми профилями", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "source.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(page.locator(".feedback")).toContainText("Добавлено задач: 2");
  await page.getByLabel("Начало недели").selectOption("0");
  const edited: BackupV1 = await download(page);
  edited.settings.hideCompleted = true;
  edited.tasks[0].notes = "Edited private notes\n🦊";
  edited.tasks[0].color = "purple";
  edited.tasks[0].order = 7;
  edited.tasks[0].checklist = [
    {
      id: "roundtrip-check",
      text: "Saved checklist",
      completed: false,
      order: 2,
    },
  ];
  edited.tasks[1].color = "blue";
  await choose(page, edited);
  await page.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(page.locator(".feedback")).toContainText(
    "Копия восстановлена. Открыта текущая неделя.",
  );
  await page.getByLabel("Перейти к дате").fill("2041-02-28");
  await page.getByRole("button", { name: "Перейти", exact: true }).click();
  const original = await download(page);
  expect(original.version).toBe(1);
  expect(original.tasks).toHaveLength(2);
  expect(original.importHistory).toHaveLength(1);
  expect(original).not.toHaveProperty("selectedWeek");
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    timezoneId: "Europe/Moscow",
  });
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await other.goto("/");
  await choose(other, original);
  const preview = other.getByRole("dialog", { name: "Восстановление копии" });
  await expect(preview).toContainText("Задач: 2");
  await preview.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(other.locator(".feedback")).toContainText("Копия восстановлена");
  const restored = await download(other);
  delete original.exportedAt;
  delete restored.exportedAt;
  expect(restored).toEqual(original);
  await expect(other.getByLabel("Перейти к дате")).not.toHaveValue(
    "2041-02-28",
  );
  await expect(other.getByLabel("Начало недели")).toHaveValue("0");
  await other.getByLabel("Tweek CSV").setInputFiles({
    name: "renamed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await other.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(other.locator(".feedback")).toContainText("Добавлено задач: 0");
  expect((await download(other)).tasks).toHaveLength(2);
  await context.close();
});

test("замена сохраняет стабильные ID, ручной порядок, цвета, чек-лист и неизменное происхождение", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, fixture);
  await page.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(page.locator(".feedback")).toContainText(
    "Копия восстановлена. Открыта текущая неделя.",
  );
  expect(withoutTime(await download(page))).toEqual(withoutTime(fixture));
  await page.reload();
  await expect(page.getByLabel("Скрыть выполненные")).toBeChecked();
  await expect(page.getByLabel("Начало недели")).toHaveValue("0");
  expect(withoutTime(await download(page))).toEqual(withoutTime(fixture));
});

test("отмена и preview копии не заменяют существующие данные", async ({
  page,
}) => {
  await page.goto("/");
  const before = withoutTime(await download(page));
  await choose(page, fixture);
  const dialog = page.getByRole("dialog", { name: "Восстановление копии" });
  await expect(dialog).toContainText("полностью заменены, не объединены");
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Скачать текущую копию" }).click();
  const file = await pending;
  expect(
    withoutTime(JSON.parse(await readFile((await file.path())!, "utf8"))),
  ).toEqual(before);
  await dialog.getByRole("button", { name: "Отмена" }).click();
  expect(withoutTime(await download(page))).toEqual(before);
});

test("preview доступен клавиатурой: удерживает фокус, подтверждает и отменяет с возвратом фокуса", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, fixture);
  const dialog = page.getByRole("dialog", { name: "Восстановление копии" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Отмена" })).toBeFocused();
  const confirm = dialog.getByRole("button", { name: "Заменить все данные" });
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    if (await confirm.evaluate((element) => element.matches(":focus"))) break;
  }
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback")).toContainText(
    "Копия восстановлена. Открыта текущая неделя.",
  );
  await choose(page, fixture);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Отмена" })).toBeFocused();
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    const target = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return "body";
      return element.closest("dialog")
        ? "dialog"
        : `outside:${element.tagName}`;
    });
    expect(["body", "dialog"]).toContain(target);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Восстановить JSON")).toBeFocused();
});

test("неудачная замена с перерисовками не теряет выбранную копию, повторная попытка успешна", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, fixture);
  const dialog = page.getByRole("dialog", { name: "Восстановление копии" });
  await expect(dialog).toContainText("Задач: 3. Списков: 2.");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.clear = original;
      return request;
    };
  });
  await dialog.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(dialog).toContainText(
    "Восстановление не сохранено. База не изменена. Повторите попытку.",
  );
  await expect(dialog).toContainText("Задач: 3. Списков: 2.");
  await dialog.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(page.locator(".feedback")).toContainText(
    "Копия восстановлена. Открыта текущая неделя.",
  );
  expect(withoutTime(await download(page))).toEqual(withoutTime(fixture));
});

test("копии и задачи не отправляются за пределы localhost", async ({
  page,
}) => {
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      foreign.push(request.url());
  });
  await page.goto("/");
  await choose(page, fixture);
  await page.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(page.locator(".feedback")).toContainText("Копия восстановлена");
  await choose(page, fixture);
  await page
    .getByRole("dialog", { name: "Восстановление копии" })
    .getByRole("button", { name: "Отмена" })
    .click();
  await download(page);
  expect(foreign).toEqual([]);
});

test("отклоняет неверное происхождение источника до preview и не меняет данные", async ({
  page,
}) => {
  await page.goto("/");
  const before = withoutTime(await download(page));
  const invalid = structuredClone(fixture);
  invalid.tasks[0] = {
    ...invalid.tasks[0],
    provenance: {
      ...invalid.tasks[0].provenance!,
      fields: {
        ...invalid.tasks[0].provenance!.fields,
        Checklist: "unsupported",
      },
    },
  };
  await choose(page, invalid);
  await expect(page.locator(".feedback")).toContainText("Некорректная копия");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(withoutTime(await download(page))).toEqual(before);
});

const invalidCases: [string, (data: BackupV1) => unknown][] = [
  ["unknown version", (data) => ({ ...data, version: 2 })],
  ["wrong format", (data) => ({ ...data, format: "other" })],
  ["unknown property", (data) => ({ ...data, selectedWeek: "2041-01-01" })],
  [
    "duplicate task IDs",
    (data) => {
      data.tasks[1].id = data.tasks[0].id;
      return data;
    },
  ],
  [
    "duplicate list IDs",
    (data) => {
      data.lists[1].id = data.lists[0].id;
      return data;
    },
  ],
  [
    "duplicate checklist IDs",
    (data) => {
      data.tasks[0].checklist![1].id = data.tasks[0].checklist![0].id;
      return data;
    },
  ],
  [
    "missing list reference",
    (data) => {
      data.tasks[1].placement = { listId: "missing" };
      return data;
    },
  ],
  [
    "two placements",
    (data) => {
      Object.assign(data.tasks[1].placement, { date: "2041-01-01" });
      return data;
    },
  ],
  [
    "no placement",
    (data) => {
      Object.assign(data.tasks[1], { placement: {} });
      return data;
    },
  ],
  [
    "impossible calendar date",
    (data) => {
      data.tasks[0].placement = { date: "2041-02-29" };
      return data;
    },
  ],
  [
    "year zero",
    (data) => {
      data.tasks[0].placement = { date: "0000-01-01" };
      return data;
    },
  ],
  [
    "empty title",
    (data) => {
      data.tasks[0].title = "  ";
      return data;
    },
  ],
  [
    "nonboolean status",
    (data) => {
      Object.assign(data.tasks[0], { completed: "TRUE" });
      return data;
    },
  ],
  [
    "notes type",
    (data) => {
      Object.assign(data.tasks[0], { notes: null });
      return data;
    },
  ],
  [
    "unknown color",
    (data) => {
      Object.assign(data.tasks[0], { color: "#ffffff" });
      return data;
    },
  ],
  [
    "fractional order",
    (data) => {
      data.tasks[0].order = 0.5;
      return data;
    },
  ],
  [
    "negative order",
    (data) => {
      data.lists[0].order = -1;
      return data;
    },
  ],
  [
    "duplicate list order",
    (data) => {
      data.lists[0].order = data.lists[1].order;
      return data;
    },
  ],
  [
    "duplicate task order in container",
    (data) => {
      data.tasks[1].placement = data.tasks[0].placement;
      data.tasks[1].order = data.tasks[0].order;
      return data;
    },
  ],
  [
    "duplicate list title",
    (data) => {
      data.lists[0].title = " inbox ";
      return data;
    },
  ],
  ["no lists", (data) => ({ ...data, lists: [] })],
  [
    "empty checklist text",
    (data) => {
      data.tasks[0].checklist![0].text = "";
      return data;
    },
  ],
  [
    "duplicate checklist order",
    (data) => {
      data.tasks[0].checklist![0].order = 0;
      return data;
    },
  ],
  [
    "settings type",
    (data) => ({ ...data, settings: { weekStartsOn: 2, hideCompleted: true } }),
  ],
  [
    "preference type",
    (data) => ({ ...data, settings: { weekStartsOn: 0, hideCompleted: 1 } }),
  ],
  ["missing history reference", (data) => ({ ...data, importHistory: [] })],
  [
    "duplicate history fingerprint",
    (data) => ({
      ...data,
      importHistory: [data.importHistory[0], data.importHistory[0]],
    }),
  ],
  [
    "invalid history timestamp",
    (data) => {
      data.importHistory[0].importedAt = "yesterday";
      return data;
    },
  ],
  [
    "negative history count",
    (data) => {
      data.importHistory[0].emptyRecords = -1;
      return data;
    },
  ],
  [
    "history count smaller than surviving sources",
    (data) => {
      data.importHistory[0].addedTasks = 0;
      return data;
    },
  ],
  [
    "invalid source record number",
    (data) => {
      Object.assign(data.tasks[0].provenance!, { recordNumber: 1 });
      return data;
    },
  ],
  [
    "source fields type",
    (data) => {
      Object.assign(data.tasks[0].provenance!.fields, { Notes: 1 });
      return data;
    },
  ],
  [
    "ambiguous source placement",
    (data) => {
      Object.assign(data.tasks[0].provenance!.fields, { List: "Inbox" });
      return data;
    },
  ],
  [
    "duplicate source record",
    (data) => {
      data.tasks.push({
        ...data.tasks[0],
        id: "task-d",
        order: 5,
        checklist: [],
      });
      return data;
    },
  ],
];

for (const [name, change] of invalidCases) {
  test(`отклоняет ${name} до preview и не меняет текущий план`, async ({
    page,
  }) => {
    await page.goto("/");
    const before = withoutTime(await download(page));
    await choose(page, change(structuredClone(fixture)));
    await expect(page.locator(".feedback")).toContainText(
      name === "unknown version"
        ? "Неподдерживаемая версия"
        : "Некорректная копия",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(withoutTime(await download(page))).toEqual(before);
  });
}

test("битый JSON и неверный UTF-8 отклоняются без изменения базы", async ({
  page,
}) => {
  await page.goto("/");
  const before = withoutTime(await download(page));
  for (const buffer of [Buffer.from("{broken"), Buffer.from([0xc3, 0x28])]) {
    await page.getByLabel("Восстановить JSON").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer,
    });
    await expect(page.locator(".feedback")).toContainText(
      "корректный UTF-8 JSON",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(withoutTime(await download(page))).toEqual(before);
  }
});

test("отмена транзакции после постановки очисток и записей сохраняет все хранилища и навигацию", async ({
  page,
}) => {
  await page.goto("/");
  await choose(page, fixture);
  await page.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(page.locator(".feedback")).toContainText("Копия восстановлена");
  await page.getByLabel("Перейти к дате").fill("2030-01-15");
  await page.getByRole("button", { name: "Перейти", exact: true }).click();
  const before = withoutTime(await download(page));
  const replacement = structuredClone(fixture);
  replacement.settings = { weekStartsOn: 1, hideCompleted: false };
  replacement.lists[0].title = "Replacement";
  replacement.tasks[0].title = "Replacement";
  replacement.importHistory[0].emptyRecords = 9;
  await choose(page, replacement);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      const request = original.apply(this, args);
      if (this.name === "importHistory") {
        request.addEventListener("success", () => request.transaction!.abort());
        IDBObjectStore.prototype.add = original;
      }
      return request;
    };
  });
  await page.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(page.getByRole("dialog")).toContainText("База не изменена");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  expect(withoutTime(await download(page))).toEqual(before);
  await page.reload();
  await expect(page.getByLabel("Перейти к дате")).toHaveValue("2030-01-15");
  expect(withoutTime(await download(page))).toEqual(before);
});

for (const outcome of ["allowed", "denied", "unsupported", "error"] as const) {
  test(`постоянное хранение (${outcome}) объясняет результат и не блокирует копии`, async ({
    page,
  }) => {
    await page.addInitScript((outcome) => {
      Object.defineProperty(navigator.storage, "persist", {
        value:
          outcome === "unsupported"
            ? undefined
            : async () => {
                if (outcome === "error") throw new Error("Unavailable");
                return outcome === "allowed";
              },
      });
    }, outcome);
    await page.goto("/");
    const section = page.getByRole("region", { name: "Данные" });
    await expect(section).toContainText("приватный режим");
    await expect(section).toContainText("открытым текстом");
    if (outcome !== "unsupported")
      await section
        .getByRole("button", { name: "Запросить постоянное хранение" })
        .click();
    await expect(
      section.getByLabel("Результат постоянного хранения"),
    ).toContainText(
      {
        allowed: "разрешено",
        denied: "не разрешено",
        unsupported: "не поддерживается",
        error: "Не удалось",
      }[outcome],
    );
    expect((await download(page)).format).toBe("yourweek-backup");
  });
}

test("экспорт с прежним пустым пунктом чек-листа даёт инструкции ремонта и не удаляет данные", async ({
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
  await editor
    .getByLabel("Текст пункта 1", { exact: true })
    .fill("Repaired item");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const backup = await download(page);
  expect(backup.tasks[0].checklist).toEqual([
    { id: "legacy-item", text: "Repaired item", completed: true, order: 0 },
  ]);
  expect(backup.tasks[0].notes).toBe("Keep private content");
});

test("обычное редактирование и снятие цвета сохраняют копию и происхождение CSV целиком", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "source.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Task,Notes,Checklist,Completed,List\n,Imported,Original,,FALSE,Импортный",
    ),
  });
  await page.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(page.locator(".feedback")).toContainText(
    "Добавлено задач: 1. Новых списков: 1.",
  );
  const original = await download(page);
  await page.getByRole("button", { name: "Imported", exact: true }).click();
  let editor = page.getByRole("dialog");
  await editor.getByLabel("Заметка", { exact: true }).fill("Edited note");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const neutral = await download(page);
  expect(neutral.tasks[0]).not.toHaveProperty("color");
  await page.getByRole("button", { name: "Imported", exact: true }).click();
  editor = page.getByRole("dialog");
  await editor
    .getByRole("combobox", { name: "Цвет", exact: true })
    .selectOption("red");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Imported", exact: true }).click();
  await editor
    .getByRole("combobox", { name: "Цвет", exact: true })
    .selectOption("");
  await editor
    .getByRole("button", { name: "Добавить пункт", exact: true })
    .click();
  await editor
    .getByLabel("Текст пункта 1", { exact: true })
    .fill("  Checklist\ncontent  ");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await download(page);
  expect(saved.tasks[0]).not.toHaveProperty("color");
  expect(saved.tasks[0].notes).toBe("Edited note");
  expect(saved.tasks[0].checklist[0].text).toBe("  Checklist\ncontent  ");
  expect(saved.tasks[0].provenance).toEqual(original.tasks[0].provenance);
  expect(saved.importHistory).toEqual(original.importHistory);
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    timezoneId: "Europe/Moscow",
  });
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await other.goto("/");
  await other.getByLabel("Восстановить JSON").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await other.getByRole("button", { name: "Заменить все данные" }).click();
  await expect(other.locator(".feedback")).toContainText("Копия восстановлена");
  const restored = await download(other);
  delete saved.exportedAt;
  delete restored.exportedAt;
  expect(restored).toEqual(saved);
  await context.close();
});
