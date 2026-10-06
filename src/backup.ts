import { csvHeaders } from "./csv";
import { taskColors, type PlannerSnapshot } from "./model";
import { validPlacement } from "./placement";

export interface BackupV1 {
  format: "yourweek-backup";
  version: 1;
  exportedAt: string;
  tasks: PlannerSnapshot["tasks"];
  lists: PlannerSnapshot["lists"];
  settings: PlannerSnapshot["settings"] & { hideCompleted: boolean };
  importHistory: PlannerSnapshot["importHistory"];
}

function requireValid(valid: unknown): asserts valid {
  if (!valid)
    throw new Error(
      "Некорректная копия: нарушены типы, ссылки или инварианты данных",
    );
}

function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  requireValid(
    value !== null && typeof value === "object" && !Array.isArray(value),
  );
  const record = value as Record<string, unknown>;
  requireValid(
    required.every((key) => Object.hasOwn(record, key)) &&
      Object.keys(record).every((key) =>
        [...required, ...optional].includes(key),
      ),
  );
  return record;
}

function text(value: unknown): value is string {
  return typeof value === "string" && !!value.trim();
}

function order(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function timestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function fingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function validateBackup(value: unknown): BackupV1 {
  const data = object(value, [
    "format",
    "version",
    "exportedAt",
    "tasks",
    "lists",
    "settings",
    "importHistory",
  ]);
  if (data.version !== 1)
    throw new Error("Неподдерживаемая версия резервной копии");
  requireValid(data.format === "yourweek-backup" && timestamp(data.exportedAt));
  requireValid(
    Array.isArray(data.tasks) &&
      Array.isArray(data.lists) &&
      data.lists.length > 0 &&
      Array.isArray(data.importHistory),
  );
  const settings = object(data.settings, ["weekStartsOn", "hideCompleted"]);
  requireValid(
    (settings.weekStartsOn === 0 || settings.weekStartsOn === 1) &&
      typeof settings.hideCompleted === "boolean",
  );
  const ids = new Set<string>();
  function unique(value: unknown): void {
    requireValid(text(value) && !ids.has(value));
    ids.add(value);
  }
  const listIds = new Set<string>();
  const listTitles = new Set<string>();
  const listOrders = new Set<number>();
  for (const value of data.lists) {
    const list = object(value, ["id", "title", "order"]);
    unique(list.id);
    requireValid(text(list.title) && order(list.order));
    const title = list.title.trim().toLowerCase();
    requireValid(!listTitles.has(title) && !listOrders.has(list.order));
    listTitles.add(title);
    listOrders.add(list.order);
    listIds.add(list.id as string);
  }
  const histories = new Map<string, number>();
  for (const value of data.importHistory) {
    const history = object(value, [
      "fingerprint",
      "importedAt",
      "addedTasks",
      "emptyRecords",
    ]);
    requireValid(
      fingerprint(history.fingerprint) &&
        !histories.has(history.fingerprint) &&
        timestamp(history.importedAt) &&
        order(history.addedTasks) &&
        order(history.emptyRecords),
    );
    histories.set(history.fingerprint, history.addedTasks);
  }
  const slots = new Set<string>();
  const sourceRecords = new Set<string>();
  const sourceCounts = new Map<string, number>();
  for (const value of data.tasks) {
    const task = object(
      value,
      ["id", "title", "completed", "placement", "order"],
      ["notes", "color", "checklist", "provenance"],
    );
    unique(task.id);
    requireValid(
      text(task.title) &&
        typeof task.completed === "boolean" &&
        order(task.order),
    );
    if (Object.hasOwn(task, "notes"))
      requireValid(typeof task.notes === "string");
    if (Object.hasOwn(task, "color"))
      requireValid(
        typeof task.color === "string" && Object.hasOwn(taskColors, task.color),
      );
    const placement = object(task.placement, [], ["date", "listId"]);
    requireValid(Object.keys(placement).length === 1);
    let container: string;
    if (Object.hasOwn(placement, "date")) {
      requireValid(
        typeof placement.date === "string" &&
          validPlacement({ date: placement.date }),
      );
      container = `date:${placement.date}`;
    } else {
      requireValid(text(placement.listId) && listIds.has(placement.listId));
      container = `list:${placement.listId}`;
    }
    const slot = `${container}:${task.order}`;
    requireValid(!slots.has(slot));
    slots.add(slot);
    if (Object.hasOwn(task, "checklist")) {
      requireValid(Array.isArray(task.checklist));
      const orders = new Set<number>();
      for (const value of task.checklist) {
        const item = object(value, ["id", "text", "completed", "order"]);
        unique(item.id);
        requireValid(
          text(item.text) &&
            typeof item.completed === "boolean" &&
            order(item.order) &&
            !orders.has(item.order),
        );
        orders.add(item.order);
      }
    }
    if (Object.hasOwn(task, "provenance")) {
      const source = object(task.provenance, [
        "fingerprint",
        "recordNumber",
        "fields",
      ]);
      requireValid(
        fingerprint(source.fingerprint) &&
          histories.has(source.fingerprint) &&
          order(source.recordNumber) &&
          source.recordNumber >= 2,
      );
      const fields = object(source.fields, [...csvHeaders]);
      requireValid(csvHeaders.every((key) => typeof fields[key] === "string"));
      requireValid(
        text(fields.Task) &&
          ["TRUE", "FALSE"].includes(
            (fields.Completed as string).trim().toUpperCase(),
          ),
      );
      requireValid(
        fields.Date === "" ||
          (typeof fields.Date === "string" &&
            validPlacement({ date: fields.Date })),
      );
      requireValid(
        fields.Checklist === "" &&
          (fields.Date === "" || (fields.List as string).trim() === ""),
      );
      const record = `${source.fingerprint}:${source.recordNumber}`;
      requireValid(!sourceRecords.has(record));
      sourceRecords.add(record);
      sourceCounts.set(
        source.fingerprint,
        (sourceCounts.get(source.fingerprint) ?? 0) + 1,
      );
    }
  }
  for (const [source, count] of sourceCounts)
    requireValid(count <= histories.get(source)!);
  return value as BackupV1;
}

export function createBackup(snapshot: PlannerSnapshot): BackupV1 {
  const tasks = snapshot.tasks.map((task) => {
    const emptyItem = task.checklist?.findIndex((item) => !item.text.trim());
    if (emptyItem !== undefined && emptyItem !== -1)
      throw new Error(
        `Копия не скачана: задача «${task.title}», пункт ${emptyItem + 1} содержит пустой текст. Откройте редактор и заполните или удалите этот пункт. Данные не изменены.`,
      );
    const copy = { ...task };
    if (copy.color === undefined) delete copy.color;
    return copy;
  });
  return validateBackup({
    format: "yourweek-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
    lists: snapshot.lists,
    settings: { ...snapshot.settings, hideCompleted: snapshot.hideCompleted },
    importHistory: snapshot.importHistory,
  });
}

export async function prepareBackup(file: Blob): Promise<BackupV1> {
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "Не удалось прочитать копию: требуется корректный UTF-8 JSON",
    );
  }
  return validateBackup(value);
}
