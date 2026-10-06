import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

const header = "Date,Task,Notes,Checklist,Completed,List";

test("public storage commits after current day order and preserves provenance through edits", async ({
  page,
}) => {
  await page.goto("/dev-storage");
  await page.waitForFunction(() => Boolean(window.__yourweekDevStorage));
  const result = await page.evaluate(async (header) => {
    const { PlannerStorage, prepareCsv } = window.__yourweekDevStorage!;
    const storage = await PlannerStorage.open();
    const preview = await prepareCsv(
      new Blob([
        `${header}\n2026-10-05,  Source  ,Original,,TRUE,\n\n2026-10-05,  Source  ,Original,,TRUE,`,
      ]),
    );
    await storage.createTask("Existing after preview", "2026-10-05");
    await storage.commitCsv(preview);
    const before = await storage.readWeek("2026-10-05", "2026-10-05");
    await storage.updateTask(before[1].id, {
      title: "Edited",
      notes: "Edited",
      completed: false,
    });
    const after = await storage.readWeek("2026-10-05", "2026-10-05");
    const history = await storage.readImportHistory();
    return { before, after, history };
  }, header);
  expect(
    result.before.map((task: { title: string; order: number }) => [
      task.title,
      task.order,
    ]),
  ).toEqual([
    ["Existing after preview", 0],
    ["Source", 1],
    ["Source", 2],
  ]);
  expect(
    new Set(result.before.map((task: { id: string }) => task.id)).size,
  ).toBe(3);
  expect(result.after[1].provenance).toEqual(result.before[1].provenance);
  expect(result.after[1].provenance!.recordNumber).toBe(2);
  expect(result.after[2].provenance!.recordNumber).toBe(4);
  expect(result.after[1].provenance!.fields).toEqual({
    Date: "2026-10-05",
    Task: "  Source  ",
    Notes: "Original",
    Checklist: "",
    Completed: "TRUE",
    List: "",
  });
  expect(result.history).toHaveLength(1);
  expect(result.history[0]).toMatchObject({
    fingerprint: result.after[1].provenance!.fingerprint,
    addedTasks: 2,
    emptyRecords: 1,
  });
});

test("original SHA-256 bytes, not normalized text or filename, define identity; concurrent confirmations are serialized", async ({
  page,
}) => {
  await page.goto("/dev-storage");
  await page.waitForFunction(() => Boolean(window.__yourweekDevStorage));
  const csv = `${header}\n2026-10-05,Identity,,,FALSE,`;
  const result = await page.evaluate(async (csv) => {
    const { PlannerStorage, prepareCsv } = window.__yourweekDevStorage!;
    const storage = await PlannerStorage.open();
    const lf = await prepareCsv(new Blob([csv]));
    const bom = await prepareCsv(new Blob(["\ufeff" + csv]));
    const crlf = await prepareCsv(new Blob([csv.replaceAll("\n", "\r\n")]));
    const confirmations = await Promise.all([
      storage.commitCsv(lf),
      storage.commitCsv(lf),
    ]);
    await storage.commitCsv(bom);
    await storage.commitCsv(crlf);
    return {
      fingerprints: [lf.fingerprint, bom.fingerprint, crlf.fingerprint],
      confirmations,
      tasks: await storage.readWeek("2026-10-05", "2026-10-05"),
      history: await storage.readImportHistory(),
    };
  }, csv);
  expect(result.fingerprints).toEqual(
    [csv, "\ufeff" + csv, csv.replaceAll("\n", "\r\n")].map((text) =>
      createHash("sha256").update(Buffer.from(text)).digest("hex"),
    ),
  );
  expect(
    result.confirmations
      .map((item: { addedTasks: number }) => item.addedTasks)
      .sort(),
  ).toEqual([0, 1]);
  expect(result.tasks).toHaveLength(3);
  expect(result.history).toHaveLength(3);
});

test("preview accepts the exact limits and validates records beyond the first twenty", async ({
  page,
}) => {
  await page.goto("/dev-storage");
  await page.waitForFunction(() => Boolean(window.__yourweekDevStorage));
  const result = await page.evaluate(async (header) => {
    const { prepareCsv } = window.__yourweekDevStorage!;
    const row = "2026-10-05,Limit,,,FALSE,";
    const records = await prepareCsv(
      new Blob([header + "\n" + Array(100_000).fill(row).join("\n")]),
    );
    const prefix = header + "\n2026-10-05,Limit,";
    const suffix = ",,FALSE,";
    const exact = await prepareCsv(
      new Blob([
        prefix +
          "x".repeat(5 * 1024 * 1024 - prefix.length - suffix.length) +
          suffix,
      ]),
    );
    return {
      count: records.records.length,
      duplicates: records.duplicateOccurrences,
      exactCount: exact.records.length,
    };
  }, header);
  expect(result).toEqual({ count: 100_000, duplicates: 99_999, exactCount: 1 });
});

test("undated confirmation reconciles prepared names with current lists and order while preserving source records", async ({
  page,
}) => {
  await page.goto("/dev-storage");
  await page.waitForFunction(() => Boolean(window.__yourweekDevStorage));
  const result = await page.evaluate(async (header) => {
    const { PlannerStorage, prepareCsv } = window.__yourweekDevStorage!;
    const storage = await PlannerStorage.open();
    const old = await storage.createList("Проекты");
    const preview = await prepareCsv(
      new Blob([
        `${header}\n,  Source  ,Original,,TRUE,  проекты  \n\n,  Source  ,Original,,TRUE,  проекты  \n,Default,,,FALSE,\n,Created later,,,FALSE,Работа`,
      ]),
    );
    await storage.renameList(old.id, "Архив");
    await storage.createListTask("Old task", old.id);
    const current = await storage.createList("ПРОЕКТЫ");
    await storage.createListTask("Existing after preview", current.id);
    const inbox = (await storage.readLists()).find(
      (list: { title: string }) => list.title === "Входящие",
    )!;
    await storage.deleteList(inbox.id);
    const work = await storage.createList("РАБОТА");
    await storage.commitCsv(preview);
    const before = await storage.readSnapshot();
    const imported = before.tasks.find(
      (task: { title: string }) => task.title === "Source",
    )!;
    await storage.updateTask(imported.id, {
      title: "Edited",
      notes: "Edited",
      completed: false,
    });
    return { before, after: await storage.readSnapshot(), current, old, work };
  }, header);
  const tasks = result.before.tasks
    .filter((task) => task.placement.listId === result.current.id)
    .sort((a: { order: number }, b: { order: number }) => a.order - b.order);
  expect(
    tasks.map((task: { title: string; order: number }) => [
      task.title,
      task.order,
    ]),
  ).toEqual([
    ["Existing after preview", 0],
    ["Source", 1],
    ["Source", 2],
  ]);
  expect(new Set(tasks.map((task: { id: string }) => task.id)).size).toBe(3);
  expect(tasks.slice(1).map((task) => task.provenance!.recordNumber)).toEqual([
    2, 4,
  ]);
  expect(tasks[1].provenance!.fields).toEqual({
    Date: "",
    Task: "  Source  ",
    Notes: "Original",
    Checklist: "",
    Completed: "TRUE",
    List: "  проекты  ",
  });
  expect(
    result.after.tasks.find((task) => task.id === tasks[1].id)!.provenance,
  ).toEqual(tasks[1].provenance);
  expect(
    result.before.tasks.find((task) => task.title === "Old task")!.placement,
  ).toEqual({ listId: result.old.id });
  expect(
    result.before.tasks.find((task) => task.title === "Created later")!
      .placement,
  ).toEqual({ listId: result.work.id });
  expect(
    result.before.lists
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
      .map((list: { title: string }) => list.title),
  ).toEqual(["Личное", "Идеи", "Архив", "ПРОЕКТЫ", "РАБОТА", "Входящие"]);
  expect(result.before.importHistory).toHaveLength(1);
  expect(result.before.importHistory[0]).toMatchObject({
    addedTasks: 4,
    emptyRecords: 1,
  });
});

test("public storage rejects blank checklist drafts and shares creation defaults for days and lists", async ({
  page,
}) => {
  await page.goto("/dev-storage");
  await page.waitForFunction(() => Boolean(window.__yourweekDevStorage));
  const result = await page.evaluate(async () => {
    const { PlannerStorage } = window.__yourweekDevStorage!;
    const storage = await PlannerStorage.open();
    const list = (await storage.readLists())[0];
    const day = await storage.createTask("  Day  ", "2044-02-29");
    const undated = await storage.createListTask("  Undated  ", list.id);
    const second = await storage.createListTask("Second", list.id);
    const errors = [];
    for (const create of [
      () => storage.createTask("  ", "2044-02-29"),
      () => storage.createListTask("  ", list.id),
    ]) {
      try {
        await create();
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    try {
      await storage.updateTask(day.id, {
        notes: "Must not persist",
        checklist: [{ id: "item", text: " \n\t ", completed: false, order: 0 }],
      });
    } catch (error) {
      errors.push((error as Error).message);
    }
    return {
      day,
      undated,
      second,
      errors,
      snapshot: await storage.readSnapshot(),
    };
  });
  expect(result.day).toMatchObject({
    title: "Day",
    completed: false,
    order: 0,
    placement: { date: "2044-02-29" },
  });
  expect(result.undated).toMatchObject({
    title: "Undated",
    completed: false,
    order: 0,
  });
  expect(result.second.order).toBe(1);
  expect(result.errors).toEqual([
    "Введите название задачи",
    "Введите название задачи",
    "Введите непустой текст пункта чек-листа",
  ]);
  expect(result.snapshot.tasks).toHaveLength(3);
  expect(
    result.snapshot.tasks.find(
      (task: { id: string }) => task.id === result.day.id,
    ),
  ).toEqual(result.day);
});
