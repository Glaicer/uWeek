import { afterAll, expect, test } from "vitest";
import { db } from "./db/client";
import { users } from "./db/schema";
import {
  createList,
  createTask,
  deleteTask,
  listTasks,
  readWeek,
  searchTasks,
  updateSettings,
  updateTask,
} from "./planner";

afterAll(() => db.$client.end());

async function newUser() {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, name: "", email: `${id}@example.com` });
  return id;
}

test("search matches title and notes without case, across dates and lists, only for the owner", async () => {
  const user = await newUser();
  const other = await newUser();
  const list = await createList(user, { title: "Ideas" });
  const first = await createTask(user, {
    title: "Orchid care",
    date: "2027-01-01",
  });
  const second = await createTask(user, { title: "Supplies", listId: list.id });
  await updateTask(user, second.id, { notes: "Buy ORCHID food" });
  await createTask(other, { title: "Secret orchid", date: "2026-11-09" });
  await createTask(user, { title: "Unrelated", date: "2026-11-09" });

  expect(await searchTasks(user, { query: "  oRcHiD  " })).toEqual({
    items: [
      { id: first.id, title: "Orchid care", notes: "", repeats: false },
      {
        id: second.id,
        title: "Supplies",
        notes: "Buy ORCHID food",
        repeats: false,
      },
    ],
    nextCursor: null,
  });
});

test("deleting a series from its beginning removes it from search", async () => {
  const user = await newUser();
  const seed = await createTask(user, {
    title: "Deleted routine",
    date: "2026-12-01",
  });
  await updateTask(user, seed.id, {
    repeat: { every: "day", interval: 1, until: null },
  });
  await deleteTask(user, seed.id, "following");
  expect(await searchTasks(user, { query: "routine" })).toEqual({
    items: [],
    nextCursor: null,
  });
});

test("search pages have a stable order, and wildcard characters are literal text", async () => {
  const user = await newUser();
  for (let index = 0; index < 21; index++)
    await createTask(user, {
      title: `Page ${String(index).padStart(2, "0")}`,
      date: "2026-11-09",
    });
  const first = await searchTasks(user, { query: "page" });
  const last = await searchTasks(user, {
    query: "page",
    cursor: first.nextCursor!,
  });
  expect(first.items).toHaveLength(20);
  expect(first.items[0].title).toBe("Page 00");
  expect(first.items[19].title).toBe("Page 19");
  expect(first.nextCursor).toBe(20);
  expect(last.items.map((item) => item.title)).toEqual(["Page 20"]);
  expect(last.nextCursor).toBeNull();
  expect(await searchTasks(user, { query: "page", cursor: 21 })).toEqual({
    items: [],
    nextCursor: null,
  });
  const literal = await createTask(user, {
    title: "100%_\\ done",
    date: "2026-11-09",
  });
  expect(
    (await searchTasks(user, { query: "%_\\" })).items.map((item) => item.id),
  ).toEqual([literal.id]);
  for (const input of [
    { query: " " },
    { query: "a".repeat(501) },
    { query: "page", cursor: -1 },
    { query: "page", cursor: 0.5 },
  ])
    await expect(searchTasks(user, input)).rejects.toThrow();
});

test("a series is searched by its template once, not by its stored or changed occurrences", async () => {
  const user = await newUser();
  const seed = await createTask(user, { title: "Stretch", date: "2026-11-09" });
  const series = await updateTask(user, seed.id, {
    notes: "Orchid routine",
    repeat: { every: "day", interval: 1, until: null },
  });
  const dates = await listTasks(user, { from: "2026-11-09", to: "2026-11-15" });
  await updateTask(user, dates[1].id, { completed: true });
  await updateTask(user, dates[2].id, { title: "Changed exception" });
  const result = await searchTasks(user, { query: "ORCHID" });
  expect(result).toEqual({
    items: [
      {
        id: series!.recurrence!.seriesId,
        title: "Stretch",
        notes: "Orchid routine",
        repeats: true,
      },
    ],
    nextCursor: null,
  });
  expect(
    (await searchTasks(user, { query: "Changed exception" })).items,
  ).toEqual([]);
});

test("a result opens its current week after rollover or its list, and a foreign focus is ignored", async () => {
  const user = await newUser();
  const other = await newUser();
  await updateSettings(user, { timeZone: "Europe/Moscow" });
  const dated = await createTask(user, { title: "Past", date: "2026-11-08" });
  const list = await createList(user, { title: "Ideas" });
  const listed = await createTask(user, { title: "Someday", listId: list.id });
  const future = await createTask(user, {
    title: "Future",
    date: "2026-12-01",
  });
  const foreign = await createTask(other, {
    title: "Secret",
    date: "2027-01-01",
  });
  const now = new Date("2026-11-16T10:00:00+03:00");
  const moved = await readWeek(user, { focus: dated.id }, now);
  expect(moved.focusId).toBe(dated.id);
  expect(moved.dates[0]).toBe("2026-11-16");
  const focused = moved.tasks.find((task) => task.id === dated.id)!;
  expect("date" in focused ? focused.date : undefined).toBe("2026-11-16");
  expect((await readWeek(user, { focus: listed.id }, now)).focusId).toBe(
    listed.id,
  );
  expect((await readWeek(user, { focus: future.id }, now)).dates[0]).toBe(
    "2026-11-30",
  );
  const denied = await readWeek(user, { focus: foreign.id }, now);
  expect(denied.focusId).toBeUndefined();
  expect(denied.dates[0]).toBe("2026-11-16");
  await deleteTask(user, future.id);
  expect(
    (await readWeek(user, { focus: future.id }, now)).focusId,
  ).toBeUndefined();
});

test("a series result reaches a live occurrence even when its first occurrences were deleted", async () => {
  const user = await newUser();
  const seed = await createTask(user, { title: "Routine", date: "2026-12-01" });
  const repeated = await updateTask(user, seed.id, {
    repeat: { every: "day", interval: 1, until: "2026-12-05" },
  });
  const seriesId = repeated!.recurrence!.seriesId;
  await deleteTask(user, seed.id);
  await deleteTask(user, `${seriesId}_2026-12-02`);
  const view = await readWeek(
    user,
    { focus: seriesId },
    new Date("2026-11-16T10:00:00Z"),
  );
  expect(view.dates[0]).toBe("2026-11-30");
  expect(view.focusId).toBe(`${seriesId}_2026-12-03`);
  expect(view.tasks.find((task) => task.id === view.focusId)?.title).toBe(
    "Routine",
  );
});

test("a finite series with every occurrence individually deleted is not a search result", async () => {
  const user = await newUser();
  const seed = await createTask(user, { title: "Gone", date: "2026-12-01" });
  const repeated = await updateTask(user, seed.id, {
    repeat: { every: "day", interval: 1, until: "2026-12-02" },
  });
  await deleteTask(user, seed.id);
  await deleteTask(user, `${repeated!.recurrence!.seriesId}_2026-12-02`);
  expect((await searchTasks(user, { query: "gone" })).items).toEqual([]);
});

test("a completed occurrence detached from its deleted series can be opened from search", async () => {
  const user = await newUser();
  const seed = await createTask(user, { title: "Keep", date: "2026-12-01" });
  const repeated = await updateTask(user, seed.id, {
    repeat: { every: "day", interval: 1, until: null },
  });
  const id = `${repeated!.recurrence!.seriesId}_2026-12-02`;
  await updateTask(user, id, { completed: true });
  await deleteTask(user, seed.id, "following");
  expect(
    (await searchTasks(user, { query: "Keep" })).items.map((item) => item.id),
  ).toEqual([id]);
  const view = await readWeek(
    user,
    { focus: id },
    new Date("2026-11-16T10:00:00Z"),
  );
  expect(view.focusId).toBe(id);
  expect(view.dates[0]).toBe("2026-11-30");
});

test("deleted series spanning a whole search window do not leave empty pages or skip live results", async () => {
  const user = await newUser();
  for (let index = 0; index < 22; index++) {
    const seed = await createTask(user, {
      title: `Boundary gone ${index}`,
      date: "2026-12-01",
    });
    await updateTask(user, seed.id, {
      repeat: { every: "day", interval: 1, until: "2026-12-01" },
    });
    await deleteTask(user, seed.id);
  }
  const titles = Array.from(
    { length: 21 },
    (_, index) => `Boundary live ${String(index).padStart(2, "0")}`,
  );
  for (const title of titles)
    await createTask(user, { title, date: "2026-12-01" });
  const first = await searchTasks(user, { query: "Boundary" });
  expect(first.items.map((item) => item.title)).toEqual(titles.slice(0, 20));
  expect(first.nextCursor).not.toBeNull();
  const second = await searchTasks(user, {
    query: "Boundary",
    cursor: first.nextCursor!,
  });
  expect(second.items.map((item) => item.title)).toEqual(["Boundary live 20"]);
  expect(second.nextCursor).toBeNull();
  expect(await searchTasks(user, { query: "Boundary" })).toEqual(first);
});
