import { readFile } from "node:fs/promises";
import { afterAll, expect, test } from "vitest";
import { db } from "./db/client";
import { users } from "./db/schema";
import {
  createList,
  createTask,
  deleteTask,
  importCsv,
  listTasks,
  previewCsv,
  readWeek,
  updateTask,
} from "./planner";

afterAll(() => db.$client.end());

const now = new Date("2026-11-09T10:00:00Z");
const header = "Date,Task,Notes,Checklist,Completed,List\n";
const viewOf = (user: string) => readWeek(user, { week: "2026-11-09" }, now);

async function newUser() {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, name: "", email: `${id}@example.com` });
  return id;
}

test("the Tweek sample previews without writes, then imports all records including future dates and literal notes", async () => {
  const user = await newUser();
  const file = new Blob([await readFile("docs/tweek_csv/sample.csv")]);
  const preview = await previewCsv(user, file);
  expect(preview).toMatchObject({
    tasks: 16650,
    completed: 2,
    undated: 0,
    emptyRecords: 0,
    duplicateOccurrences: 13,
    firstDate: "2026-10-01",
    lastDate: "2040-01-01",
    newLists: [],
    alreadyImported: false,
  });
  expect(preview.sample).toHaveLength(20);
  const range = { from: "2026-10-01", to: "2040-01-01" };
  expect(await listTasks(user, range)).toEqual([]);
  expect((await viewOf(user)).lists).toEqual([]);

  expect(await importCsv(user, file, preview.fingerprint)).toEqual({
    addedTasks: 16650,
    addedLists: 0,
    alreadyImported: false,
  });
  const tasks = await listTasks(user, range);
  expect(tasks).toHaveLength(16650);
  expect(tasks[0]).toMatchObject({
    title: "Sample task 001",
    date: "2026-10-01",
    completed: false,
    provenance: {
      fingerprint: preview.fingerprint,
      recordNumber: 2,
      fields: {
        Date: "2026-10-01",
        Task: "Sample task 001",
        Notes: "",
        Checklist: "",
        Completed: "FALSE",
        List: "",
      },
    },
  });
  expect(tasks.at(-1)).toMatchObject({
    date: "2040-01-01",
    title: "Sample task 003",
  });
  expect(tasks.filter((task) => task.completed)).toHaveLength(2);
  expect(
    tasks.find((task) => task.title === "Sample task 007")?.notes,
  ).toContain('"quotes" and <script>literal</script>');
  expect(tasks.every((task) => !task.recurrence)).toBe(true);
});

test("import appends in source order, matches list names, keeps duplicate rows and immutable provenance", async () => {
  const user = await newUser();
  const books = await createList(user, { title: " Books " });
  const inbox = await createList(user, { title: "Inbox" });
  await createTask(user, { title: "Existing book", listId: books.id });
  await createTask(user, { title: "Existing day", date: "2026-11-10" });
  const file = new Blob([
    header +
      ",  Read  ,<script>literal</script>,,false,bOoKs\n" +
      ",Read,,,true, books \n" +
      "2026-11-10,Day one,,,false,\n" +
      ",Milk,,,false,\n" +
      ",New list task,,,false,Travel\n" +
      "2026-11-10,Day one,,,false,\n" +
      ",,,,,\n",
  ]);
  const preview = await previewCsv(user, file);
  expect(preview).toMatchObject({
    tasks: 6,
    completed: 1,
    undated: 4,
    newLists: ["Travel"],
    emptyRecords: 1,
    duplicateOccurrences: 1,
  });
  expect(await importCsv(user, file, preview.fingerprint)).toEqual({
    addedTasks: 6,
    addedLists: 1,
    alreadyImported: false,
  });
  const view = await viewOf(user);
  expect(view.lists.map((list) => list.title)).toEqual([
    "Books",
    "Inbox",
    "Travel",
  ]);
  expect(
    view.tasks
      .filter((task) => task.listId === books.id)
      .map((task) => task.title),
  ).toEqual(["Existing book", "Read", "Read"]);
  expect(view.tasks.find((task) => task.title === "Milk")?.listId).toBe(
    inbox.id,
  );
  const day = view.tasks.filter((task) => task.date === "2026-11-10");
  expect(day.map((task) => task.title)).toEqual([
    "Existing day",
    "Day one",
    "Day one",
  ]);
  expect(new Set(day.map((task) => task.id)).size).toBe(3);
  const imported = view.tasks.find(
    (task) => task.notes === "<script>literal</script>",
  )!;
  await updateTask(user, imported.id, {
    title: "Edited",
    notes: "",
    completed: true,
  });
  expect(
    (await viewOf(user)).tasks.find((task) => task.id === imported.id)
      ?.provenance,
  ).toEqual({
    fingerprint: preview.fingerprint,
    recordNumber: 2,
    fields: {
      Date: "",
      Task: "  Read  ",
      Notes: "<script>literal</script>",
      Checklist: "",
      Completed: "false",
      List: "bOoKs",
    },
  });
});

test("repeat and concurrent confirmations add zero, while another user can import the same bytes", async () => {
  const alice = await newUser();
  const bob = await newUser();
  const file = new Blob([header + ",Private task,,,false,Private list\n"]);
  const preview = await previewCsv(alice, file);
  const results = await Promise.all([
    importCsv(alice, file, preview.fingerprint),
    importCsv(alice, file, preview.fingerprint),
  ]);
  expect(results.map((result) => result.addedTasks).sort()).toEqual([0, 1]);
  expect((await previewCsv(alice, file)).alreadyImported).toBe(true);
  expect((await viewOf(alice)).lists).toHaveLength(1);
  expect((await viewOf(alice)).tasks).toHaveLength(1);
  expect((await viewOf(bob)).tasks).toEqual([]);
  expect((await previewCsv(bob, file)).alreadyImported).toBe(false);
  expect((await previewCsv(bob, file)).newLists).toEqual(["Private list"]);
  expect(await importCsv(bob, file, preview.fingerprint)).toEqual({
    addedTasks: 1,
    addedLists: 1,
    alreadyImported: false,
  });
  const task = (await viewOf(alice)).tasks[0];
  await deleteTask(alice, task.id);
  expect(await importCsv(alice, file, preview.fingerprint)).toEqual({
    addedTasks: 0,
    addedLists: 0,
    alreadyImported: true,
  });
  expect((await viewOf(alice)).tasks).toEqual([]);
  expect((await viewOf(bob)).tasks).toHaveLength(1);
});

test("an invalid record or changed file leaves tasks, lists and import history untouched", async () => {
  const user = await newUser();
  const before = await viewOf(user);
  const valid = new Blob([header + ",Valid,,,false,New list\n"]);
  const invalid = new Blob([
    header + ",Valid,,,false,New list\n,Invalid,,item,false,\n",
  ]);
  const { fingerprint } = await previewCsv(user, valid);
  await expect(previewCsv(user, invalid)).rejects.toThrow("Record 3:");
  await expect(importCsv(user, invalid, fingerprint)).rejects.toThrow(
    "Record 3:",
  );
  await expect(
    importCsv(user, new Blob([header + ",Changed,,,false,\n"]), fingerprint),
  ).rejects.toThrow("The file changed");
  expect(await viewOf(user)).toEqual(before);
  expect((await previewCsv(user, valid)).alreadyImported).toBe(false);
});

test("a database failure after the first task batch rolls back tasks, lists and the fingerprint", async () => {
  const user = await newUser();
  const existing = await createList(user, { title: "Existing" });
  await createTask(user, { title: "Keep", listId: existing.id });
  const before = await viewOf(user);
  const text =
    header +
    ",Valid,,,false,New list\n".repeat(501) +
    ",Bad\u0000text,,,false,New list\n";
  const file = new Blob([text]);
  const { fingerprint } = await previewCsv(user, file);
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(importCsv(user, file, fingerprint)).rejects.toThrow();
    expect(await viewOf(user)).toEqual(before);
    expect((await previewCsv(user, file)).alreadyImported).toBe(false);
  }
  const corrected = new Blob([text.replace("\u0000", "")]);
  const preview = await previewCsv(user, corrected);
  expect(await importCsv(user, corrected, preview.fingerprint)).toEqual({
    addedTasks: 502,
    addedLists: 1,
    alreadyImported: false,
  });
});

test("a maximum-size import remains readable with existing checklists", async () => {
  const user = await newUser();
  const inbox = await createList(user, { title: "Inbox" });
  const existing = await createTask(user, { title: "Keep", listId: inbox.id });
  await updateTask(user, existing.id, {
    checklist: [
      { id: crypto.randomUUID(), text: "Keep item", completed: true },
    ],
  });
  const file = new Blob([header + ",Imported,,,false,\n".repeat(100_000)]);
  const preview = await previewCsv(user, file);
  expect(preview.tasks).toBe(100_000);
  expect(await importCsv(user, file, preview.fingerprint)).toEqual({
    addedTasks: 100_000,
    addedLists: 0,
    alreadyImported: false,
  });
  const view = await viewOf(user);
  expect(view.tasks).toHaveLength(100_001);
  expect(view.tasks[0]).toMatchObject({
    title: "Keep",
    checklist: [{ text: "Keep item", completed: true }],
  });
  expect(view.tasks.at(-1)).toMatchObject({
    title: "Imported",
    listId: inbox.id,
    checklist: [],
  });
}, 30_000);

test("CSV follows saved tasks but precedes virtual occurrences without changing the series", async () => {
  const user = await newUser();
  await createTask(user, { title: "Existing saved", date: "2026-11-10" });
  const seed = await createTask(user, {
    title: "Existing recurring",
    date: "2026-11-09",
  });
  await updateTask(user, seed.id, {
    repeat: { every: "day", interval: 1, until: "2026-11-11" },
  });
  const file = new Blob([header + "2026-11-10,Imported,,,false,\n"]);
  const preview = await previewCsv(user, file);
  await importCsv(user, file, preview.fingerprint);
  const tasks = await listTasks(user, { from: "2026-11-10", to: "2026-11-11" });
  expect(tasks.map((task) => task.title)).toEqual([
    "Existing saved",
    "Imported",
    "Existing recurring",
    "Existing recurring",
  ]);
  expect(tasks[2].recurrence).toMatchObject({ occurrence: "2026-11-10" });
  expect(tasks[3].recurrence).toMatchObject({ occurrence: "2026-11-11" });
  await updateTask(user, tasks[2].id, { title: "Changed series" }, "following");
  expect(
    (await listTasks(user, { from: "2026-11-10", to: "2026-11-11" })).map(
      (task) => task.title,
    ),
  ).toEqual(["Existing saved", "Imported", "Changed series", "Changed series"]);
});
