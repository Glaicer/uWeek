import {
  chromium,
  firefox,
  expect,
  test,
  type Page,
  type Locator,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { deepStrictEqual } from "node:assert/strict";
import type { BackupV1 } from "../src/backup";

const note = (
  'Русский 🦊, "кавычки"\n<script>window.acceptanceLeak=1</script>\nhttps://example.invalid/private\n' +
  "я".repeat(3408)
).slice(0, 3408);
const records = Array.from({ length: 16637 }, (_, index) => ({
  // Держим все синтетические даты не раньше фиксированного «сегодня»
  // (2026-10-05): иначе авто-перенос (ticket 11) сдвинул бы часть задач
  // при повторном открытии/перезагрузке и сломал бы строгие сравнения копий.
  Date: new Date(Date.UTC(2026, 9, 5 + Math.floor((index * 4840) / 16636)))
    .toISOString()
    .slice(0, 10),
  Task: `Синтетическая задача ${index}`,
  Notes: index === 100 ? note : "",
  Checklist: "",
  Completed: index === 20 || index === 30 ? "TRUE" : "FALSE",
  List: "",
}));
records[records.length - 1].Date = "2040-01-01";
records.push(...records.slice(0, 13).map((record) => ({ ...record })));
const csv = Buffer.from(
  "\ufeffDate,Task,Notes,Checklist,Completed,List\r\n" +
    records
      .map((record) =>
        Object.values(record)
          .map((value) => `"${value.replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n"),
);

async function key(_page: Page, locator: Locator, value = "Enter") {
  await expect(locator).toBeEnabled();
  await locator.press(value);
}
async function backup(page: Page): Promise<BackupV1> {
  const pending = page.waitForEvent("download");
  await key(
    page,
    page.getByRole("button", { name: "Скачать резервную копию", exact: true }),
  );
  const file = await pending;
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}
function data(value: BackupV1) {
  const rest: Partial<BackupV1> = { ...value };
  delete rest.exportedAt;
  return rest;
}
async function importFile(page: Page, buffer: Buffer, count: number) {
  await page
    .getByLabel("Tweek CSV")
    .setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer });
  const preview = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(preview).toContainText("правил повторения");
  const start = performance.now();
  await key(page, preview.getByRole("button", { name: "Подтвердить импорт" }));
  await expect(page.locator(".feedback")).toContainText(
    `Добавлено задач: ${count}.`,
  );
  return performance.now() - start;
}
async function create(page: Page, container: Locator, title: string) {
  const input = container.getByRole("textbox", { name: /Новая задача/ });
  await input.fill(title);
  await input.press("Enter");
  await expect(
    container.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
}

for (const [name, engine] of [
  ["chromium", chromium],
  ["firefox", firefox],
] as const) {
  test(`${name}: full migration, keyboard planning, profile reopen and offline backup transfer`, async ({
    baseURL,
  }, info) => {
    let context = await engine.launchPersistentContext(
      info.outputPath(`${name}-profile`),
      { timezoneId: "Europe/Moscow", viewport: { width: 1440, height: 1000 } },
    );
    context.setDefaultTimeout(10_000);
    const launch = async (offline: boolean) => {
      const next = await engine.launchPersistentContext(
        info.outputPath(`${name}-profile`),
        {
          timezoneId: "Europe/Moscow",
          offline,
          viewport: { width: 360, height: 900 },
        },
      );
      return next;
    };
    try {
      let page = context.pages()[0];
      await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
      await page.goto(baseURL!);
      await expect(
        page.getByText("Готово к работе офлайн", { exact: true }),
      ).toBeVisible();
      const requests: string[] = [];
      context.on("request", (request) => requests.push(request.url()));
      const importMs = await importFile(page, csv, 16650);
      expect(importMs).toBeLessThanOrEqual(15000);
      await expect(page.getByLabel("Перейти к дате")).toHaveValue("2026-10-05");
      const source = await backup(page);
      expect(source.tasks).toHaveLength(16650);
      expect(source.tasks.filter((task) => task.completed)).toHaveLength(2);
      const imported = [...source.tasks].sort(
        (a, b) => a.provenance!.recordNumber - b.provenance!.recordNumber,
      );
      const orders = new Map<string, number>();
      deepStrictEqual(
        imported.map((task) => task.provenance!.fields),
        records,
      );
      const expected = records.map((record, index) => {
        const order = orders.get(record.Date) ?? 0;
        orders.set(record.Date, order + 1);
        return {
          title: record.Task,
          notes: record.Notes,
          date: record.Date,
          completed: record.Completed === "TRUE",
          order,
          recordNumber: index + 2,
        };
      });
      deepStrictEqual(
        imported.map((task) => ({
          title: task.title,
          notes: task.notes,
          date: task.placement.date,
          completed: task.completed,
          order: task.order,
          recordNumber: task.provenance!.recordNumber,
        })),
        expected,
      );
      expect(new Set(source.tasks.map((task) => task.id)).size).toBe(16650);
      const first = page.locator('.day[data-date="2026-10-05"]');
      const last = page.locator(".day").last();
      expect((await first.boundingBox())!.y).toBe(
        (await last.boundingBox())!.y,
      );
      await create(page, first, "План клавиатурой");
      await create(page, first, "Следующая задача");
      await key(
        page,
        first.getByRole("button", {
          name: "Выше: Следующая задача",
          exact: true,
        }),
      );
      await expect(page.locator(".feedback")).toHaveText("Порядок сохранён");
      await key(
        page,
        first.getByRole("button", { name: "План клавиатурой", exact: true }),
      );
      const editor = page.getByRole("dialog", { name: "Редактор задачи" });
      await editor.getByLabel("Заметка", { exact: true }).fill(note);
      await editor.getByLabel("Цвет").selectOption("blue");
      await key(page, editor.getByRole("button", { name: "Добавить пункт" }));
      await page.keyboard.insertText("Проверка чек-листа");
      await key(
        page,
        editor.getByLabel("Выполнен пункт 1", { exact: true }),
        "Space",
      );
      await editor
        .getByLabel("Размещение", { exact: true })
        .selectOption("list");
      await editor
        .getByLabel("Список задачи", { exact: true })
        .selectOption({ label: "Личное" });
      await key(
        page,
        editor.getByRole("button", { name: "Сохранить", exact: true }),
      );
      await expect(editor).toHaveCount(0);
      const personal = page.getByRole("region", {
        name: "Список: Личное",
        exact: true,
      });
      await expect(
        personal.getByRole("checkbox", {
          name: "Выполнена: План клавиатурой",
          exact: true,
        }),
      ).not.toBeChecked();
      await key(
        page,
        personal.getByRole("checkbox", {
          name: "Выполнена: План клавиатурой",
          exact: true,
        }),
        "Space",
      );
      await expect(page.locator(".feedback")).toHaveText(
        "Выполнение сохранено",
      );
      await key(
        page,
        personal.getByRole("checkbox", {
          name: "Выполнена: План клавиатурой",
          exact: true,
        }),
        "Space",
      );
      await expect(page.locator(".feedback")).toHaveText(
        "Выполнение сохранено",
      );
      await key(
        page,
        personal.getByRole("button", { name: "План клавиатурой", exact: true }),
      );
      await editor
        .getByLabel("Размещение", { exact: true })
        .selectOption("date");
      await editor
        .getByLabel("Дата задачи", { exact: true })
        .fill("2026-10-06");
      await key(
        page,
        editor.getByRole("button", { name: "Сохранить", exact: true }),
      );
      await expect(editor).toHaveCount(0);
      await key(
        page,
        page.getByRole("button", { name: "Следующая неделя", exact: true }),
      );
      await expect(page.locator('.day[data-date="2026-10-12"]')).toBeVisible();
      const weekStart = performance.now();
      await key(
        page,
        page.getByRole("button", { name: "Предыдущая неделя", exact: true }),
      );
      await expect(first).toBeVisible();
      const weekMs = performance.now() - weekStart;
      expect(weekMs).toBeLessThanOrEqual(1000);
      await key(page, page.getByRole("button", { name: "Поиск", exact: true }));
      const search = page.getByRole("dialog", {
        name: "Поиск задач",
        exact: true,
      });
      await search
        .getByLabel("Поиск по тексту")
        .fill("Синтетическая задача 100");
      await expect(search.getByRole("listitem")).toHaveCount(50);
      const searchStart = performance.now();
      await search.getByLabel("Поиск по тексту").fill("Проверка чек-листа");
      await expect(search.getByRole("listitem")).toHaveCount(1);
      const searchMs = performance.now() - searchStart;
      expect(searchMs).toBeLessThanOrEqual(1000);
      await key(page, search.getByRole("button", { name: "Закрыть поиск" }));
      expect(await page.evaluate(() => "acceptanceLeak" in window)).toBe(false);
      expect(requests).toEqual([]);
      const planned = await backup(page);
      await context.close();
      context = await launch(true);
      page = context.pages()[0];
      await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
      await page.goto(baseURL!);
      deepStrictEqual(data(await backup(page)), data(planned));
      await expect(page.locator(".day")).toHaveCount(7);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await create(page, page.locator(".day").first(), "Офлайн временная");
      await key(
        page,
        page.getByRole("button", { name: "Офлайн временная", exact: true }),
      );
      const offlineEditor = page.getByRole("dialog", {
        name: "Редактор задачи",
      });
      await offlineEditor
        .getByLabel("Заметка", { exact: true })
        .fill("Офлайн заметка");
      await key(
        page,
        offlineEditor.getByRole("button", { name: "Добавить пункт" }),
      );
      await page.keyboard.insertText("Офлайн пункт");
      await key(
        page,
        offlineEditor.getByLabel("Выполнен пункт 1", { exact: true }),
        "Space",
      );
      await offlineEditor
        .getByLabel("Размещение", { exact: true })
        .selectOption("list");
      await offlineEditor
        .getByLabel("Список задачи", { exact: true })
        .selectOption({ label: "Личное" });
      await key(
        page,
        offlineEditor.getByRole("button", { name: "Сохранить", exact: true }),
      );
      await expect(offlineEditor).toHaveCount(0);
      const offlineList = page.getByRole("region", {
        name: "Список: Личное",
        exact: true,
      });
      await create(page, offlineList, "Офлайн соседняя");
      await key(
        page,
        offlineList.getByRole("button", {
          name: "Выше: Офлайн соседняя",
          exact: true,
        }),
      );
      await expect(offlineList.locator(".task-title")).toHaveText([
        "Офлайн соседняя",
        "Офлайн временная",
      ]);
      await key(
        page,
        offlineList.getByRole("checkbox", {
          name: "Выполнена: Офлайн временная",
          exact: true,
        }),
        "Space",
      );
      await expect(
        offlineList.getByRole("checkbox", {
          name: "Выполнена: Офлайн временная",
          exact: true,
        }),
      ).toBeChecked();
      await key(
        page,
        offlineList.getByRole("button", {
          name: "Офлайн временная",
          exact: true,
        }),
      );
      await expect(
        offlineEditor.getByLabel("Текст пункта 1", { exact: true }),
      ).toHaveValue("Офлайн пункт");
      page.once("dialog", (dialog) => dialog.accept());
      await key(
        page,
        offlineEditor.getByRole("button", { name: "Удалить задачу" }),
      );
      await expect(offlineEditor).toHaveCount(0);
      await importFile(
        page,
        Buffer.from(
          "Date,Task,Notes,Checklist,Completed,List\n,Офлайн импорт,,,FALSE,Идеи",
        ),
        1,
      );
      await key(page, page.getByRole("button", { name: "Поиск", exact: true }));
      const offlineSearch = page.getByRole("dialog", {
        name: "Поиск задач",
        exact: true,
      });
      await offlineSearch.getByLabel("Поиск по тексту").fill("Офлайн импорт");
      await expect(offlineSearch.getByRole("listitem")).toHaveCount(1);
      await key(
        page,
        offlineSearch.getByRole("button", { name: "Закрыть поиск" }),
      );
      await page.getByLabel("Начало недели").selectOption("0");
      await expect(page.locator('.day[data-date="2026-10-04"]')).toBeVisible();
      await key(
        page,
        page.getByLabel("Скрыть выполненные", { exact: true }),
        "Space",
      );
      await expect(page.locator(".feedback")).toHaveText("Настройка сохранена");
      const newList = page.getByLabel("Название нового списка", {
        exact: true,
      });
      await newList.fill("Офлайн список");
      await newList.press("Enter");
      const offlineCategory = page.getByRole("region", {
        name: "Список: Офлайн список",
        exact: true,
      });
      await key(
        page,
        offlineCategory.getByRole("button", { name: "Переименовать список" }),
      );
      const listTitle = offlineCategory.getByLabel("Название списка", {
        exact: true,
      });
      await listTitle.fill("Офлайн переименованный");
      await listTitle.press("Enter");
      const renamed = page.getByRole("region", {
        name: "Список: Офлайн переименованный",
        exact: true,
      });
      await key(page, renamed.getByRole("button", { name: "Удалить список" }));
      await expect(renamed).toHaveCount(0);
      const final = await backup(page);
      const other = await engine.launchPersistentContext(
        info.outputPath(`${name}-restored-profile`),
        { timezoneId: "Europe/Moscow" },
      );
      try {
        const restored = other.pages()[0];
        await restored.clock.setFixedTime(
          new Date("2026-10-05T12:00:00+03:00"),
        );
        await restored.goto(baseURL!);
        await expect(
          restored.getByText("Готово к работе офлайн", { exact: true }),
        ).toBeVisible();
        await other.setOffline(true);
        await restored.getByLabel("Восстановить JSON").setInputFiles({
          name: "backup.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(final)),
        });
        await key(
          restored,
          restored.getByRole("button", { name: "Заменить все данные" }),
        );
        await expect(restored.locator(".feedback")).toContainText(
          "Копия восстановлена",
        );
        deepStrictEqual(data(await backup(restored)), data(final));
        await importFile(restored, csv, 0);
        deepStrictEqual(data(await backup(restored)), data(final));
        await other.setOffline(false);
        await restored.reload();
        deepStrictEqual(data(await backup(restored)), data(final));
      } finally {
        await other.close();
      }
      console.log(
        JSON.stringify({
          browser: name,
          importMs: Math.round(importMs),
          weekMs: Math.round(weekMs),
          searchMs: Math.round(searchMs),
        }),
      );
    } finally {
      await context.close();
    }
  });
}
