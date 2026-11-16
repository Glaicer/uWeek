import { afterAll, expect, test } from "vitest";
import { db } from "./db/client";
import { tasks, users } from "./db/schema";
import {
  createList,
  createTask,
  deleteList,
  deleteTask,
  listTasks,
  moveList,
  readWeek,
  renameList,
  updateSettings,
  updateTask,
} from "./planner";

const week = { from: "2026-11-09", to: "2026-11-15" };

async function newUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insert(users)
    .values({ id, name: "", email: `${id}@example.com`, emailVerified: true });
  return id;
}

afterAll(() => db.$client.end());

function weekDates(first: string): string[] {
  const [year, month, day] = first.split("-").map(Number);
  return Array.from({ length: 7 }, (_, offset) =>
    new Date(Date.UTC(year, month - 1, day + offset))
      .toISOString()
      .slice(0, 10),
  );
}

test("a user sees only their own tasks and cannot change or delete another user's", async () => {
  const alice = await newUser();
  const bob = await newUser();
  const task = await createTask(alice, {
    title: "Buy milk",
    date: "2026-11-14",
  });

  expect(await listTasks(bob, week)).toEqual([]);
  expect(
    await updateTask(bob, task.id, { title: "Hacked", completed: true }),
  ).toBeNull();
  expect(await deleteTask(bob, task.id)).toBe(false);

  expect(await listTasks(alice, week)).toEqual([
    {
      id: task.id,
      title: "Buy milk",
      date: "2026-11-14",
      completed: false,
      notes: "",
      color: null,
      checklist: [],
    },
  ]);
});

test("the owner completes, uncompletes, renames and deletes tasks; a day keeps its tasks in the order they were added", async () => {
  const user = await newUser();
  const first = await createTask(user, { title: "Gym", date: "2026-11-13" });
  const second = await createTask(user, {
    title: "Call mum",
    date: "2026-11-13",
  });
  await createTask(user, { title: "Outside the week", date: "2026-11-16" });

  expect(await updateTask(user, first.id, { completed: true })).toMatchObject({
    title: "Gym",
    completed: true,
  });
  expect(await updateTask(user, first.id, { completed: false })).toMatchObject({
    completed: false,
  });
  await updateTask(user, second.id, { title: "Call dad" });
  expect((await listTasks(user, week)).map((task) => task.title)).toEqual([
    "Gym",
    "Call dad",
  ]);

  expect(await deleteTask(user, first.id)).toBe(true);
  expect((await listTasks(user, week)).map((task) => task.title)).toEqual([
    "Call dad",
  ]);
});

test("a blank title is rejected", async () => {
  const user = await newUser();
  await expect(
    createTask(user, { title: "   ", date: "2026-11-13" }),
  ).rejects.toThrow();
  expect(await listTasks(user, week)).toEqual([]);
});

test("an edit that changes nothing is rejected as invalid", async () => {
  const user = await newUser();
  const task = await createTask(user, { title: "Gym", date: "2026-11-13" });
  await expect(updateTask(user, task.id, {})).rejects.toThrow(
    "Nothing to change",
  );
});

test("a task is placed on exactly one of a date or a list", async () => {
  const userId = await newUser();
  const list = await createList(userId, { title: "Inbox" });
  const task = { userId, title: "Nowhere", position: 0 };
  await expect(
    db.insert(tasks).values({ ...task, id: crypto.randomUUID() }),
  ).rejects.toThrow();
  await expect(
    db.insert(tasks).values({
      ...task,
      id: crypto.randomUUID(),
      date: "2026-11-13",
      listId: list.id,
    }),
  ).rejects.toThrow();
});

test("the week opens on the user's today in their own time zone", async () => {
  const user = await newUser();
  await updateSettings(user, { timeZone: "Asia/Bangkok" });
  const now = new Date("2026-11-14T20:00:00Z");

  expect(await readWeek(user, {}, now)).toMatchObject({
    timeZone: "Asia/Bangkok",
    today: "2026-11-15",
    dates: weekDates("2026-11-09"),
  });

  await updateSettings(user, { weekStartsOn: 0 });
  expect(await readWeek(user, {}, now)).toMatchObject({
    weekStartsOn: 0,
    today: "2026-11-15",
    dates: weekDates("2026-11-15"),
  });
  expect((await readWeek(user, { week: "2026-12-31" }, now)).dates).toEqual(
    weekDates("2026-12-27"),
  );
});

test("unfinished tasks from past days roll over to the end of today, in date then day order, once", async () => {
  const user = await newUser();
  const other = await newUser();
  await updateSettings(user, { timeZone: "Europe/Moscow" });
  await updateSettings(other, { timeZone: "Europe/Moscow" });
  const now = new Date("2026-11-14T10:00:00+03:00");

  await createTask(user, { title: "Today's", date: "2026-11-14" });
  await createTask(user, { title: "Tue 1", date: "2026-11-10" });
  const done = await createTask(user, { title: "Done", date: "2026-11-10" });
  await updateTask(user, done.id, { completed: true });
  await createTask(user, { title: "Tue 2", date: "2026-11-10" });
  await createTask(user, { title: "Last month", date: "2026-10-31" });
  await createTask(user, { title: "Tomorrow", date: "2026-11-15" });
  await createTask(other, { title: "Not mine", date: "2026-11-10" });

  const titlesOn = async (date: string) =>
    (await readWeek(user, {}, now)).tasks
      .filter((task) => task.date === date)
      .map((task) => task.title);

  for (let read = 0; read < 2; read++) {
    expect(await titlesOn("2026-11-14")).toEqual([
      "Today's",
      "Last month",
      "Tue 1",
      "Tue 2",
    ]);
    expect(await titlesOn("2026-11-10")).toEqual(["Done"]);
    expect(await titlesOn("2026-11-15")).toEqual(["Tomorrow"]);
  }
  expect(
    (await listTasks(other, week)).map((task) => [task.title, task.date]),
  ).toEqual([["Not mine", "2026-11-10"]]);
});

test("nothing rolls over before the user's time zone is known", async () => {
  const user = await newUser();
  await createTask(user, { title: "Old", date: "2026-11-10" });
  const view = await readWeek(user, {}, new Date("2026-11-14T10:00:00Z"));
  expect(view.timeZone).toBeNull();
  expect(view.tasks.map((task) => task.date)).toEqual(["2026-11-10"]);
});

test("an unknown time zone is rejected", async () => {
  const user = await newUser();
  await expect(
    updateSettings(user, { timeZone: "Mars/Olympus" }),
  ).rejects.toThrow();
});

test("a user writes tasks into a list and finds the list with its tasks in order beside the week", async () => {
  const user = await newUser();
  const errands = await createList(user, { title: "Errands" });
  const reading = await createList(user, { title: "Reading" });
  const milk = await createTask(user, { title: "Milk", listId: errands.id });
  await createTask(user, { title: "Dune", listId: reading.id });
  await createTask(user, { title: "Bread", listId: errands.id });

  const view = await readWeek(user, {}, new Date("2026-11-14T10:00:00Z"));
  expect(view.lists).toEqual([
    { id: errands.id, title: "Errands" },
    { id: reading.id, title: "Reading" },
  ]);
  expect(
    view.tasks
      .filter((task) => task.listId === errands.id)
      .map((task) => task.title),
  ).toEqual(["Milk", "Bread"]);
  expect(milk).toEqual({
    id: milk.id,
    title: "Milk",
    listId: errands.id,
    completed: false,
    notes: "",
    color: null,
    checklist: [],
  });
});

test("a user renames lists and moves them to another place in the order", async () => {
  const user = await newUser();
  const titles = async () =>
    (await readWeek(user, {}, new Date())).lists.map((list) => list.title);
  const first = await createList(user, { title: "A" });
  const second = await createList(user, { title: "B" });
  const third = await createList(user, { title: "C" });

  expect(await renameList(user, second.id, { title: " Errands " })).toEqual({
    id: second.id,
    title: "Errands",
  });
  await expect(renameList(user, second.id, { title: " " })).rejects.toThrow();

  expect(await moveList(user, third.id, { to: 0 })).toBe(true);
  expect(await titles()).toEqual(["C", "A", "Errands"]);
  await moveList(user, third.id, { to: 2 });
  expect(await titles()).toEqual(["A", "Errands", "C"]);
  await moveList(user, first.id, { to: 1 });
  expect(await titles()).toEqual(["Errands", "A", "C"]);
});

test("deleting a list deletes its tasks; the last list stays", async () => {
  const user = await newUser();
  const keep = await createList(user, { title: "Keep" });
  const drop = await createList(user, { title: "Drop" });
  await createTask(user, { title: "Kept", listId: keep.id });
  await createTask(user, { title: "Gone", listId: drop.id });

  expect(await deleteList(user, drop.id)).toBe(true);
  expect(await deleteList(user, keep.id)).toBe(false);

  const view = await readWeek(user, {}, new Date());
  expect(view.lists).toEqual([{ id: keep.id, title: "Keep" }]);
  expect(view.tasks.map((task) => task.title)).toEqual(["Kept"]);
});

test("a user neither sees nor changes another user's lists and cannot write into them", async () => {
  const alice = await newUser();
  const bob = await newUser();
  await createList(bob, { title: "Bob's" });
  const list = await createList(alice, { title: "Private" });
  await createList(alice, { title: "Second" });
  await createTask(alice, { title: "Secret", listId: list.id });

  expect((await readWeek(bob, {}, new Date())).lists).toEqual([
    expect.objectContaining({ title: "Bob's" }),
  ]);
  expect((await readWeek(bob, {}, new Date())).tasks).toEqual([]);
  expect(await renameList(bob, list.id, { title: "Hacked" })).toBeNull();
  expect(await moveList(bob, list.id, { to: 0 })).toBe(false);
  expect(await deleteList(bob, list.id)).toBe(false);
  await expect(
    createTask(bob, { title: "Planted", listId: list.id }),
  ).rejects.toThrow();

  const view = await readWeek(alice, {}, new Date());
  expect(view.lists.map((list) => list.title)).toEqual(["Private", "Second"]);
  expect(view.tasks.map((task) => task.title)).toEqual(["Secret"]);
});

test("a user writes a note and picks a color for a task, and finds both with the week", async () => {
  const user = await newUser();
  const task = await createTask(user, { title: "Gym", date: "2026-11-13" });
  expect(task).toMatchObject({ notes: "", color: null, checklist: [] });

  expect(
    await updateTask(user, task.id, {
      notes: "Legs day\nBring towel",
      color: "green",
    }),
  ).toMatchObject({ notes: "Legs day\nBring towel", color: "green" });
  expect((await listTasks(user, week))[0]).toMatchObject({
    notes: "Legs day\nBring towel",
    color: "green",
  });

  await updateTask(user, task.id, { notes: "", color: null });
  expect(
    (await readWeek(user, {}, new Date("2026-11-13T10:00:00Z"))).tasks,
  ).toEqual([
    expect.objectContaining({ title: "Gym", notes: "", color: null }),
  ]);
  await expect(
    updateTask(user, task.id, { color: "pink" as never }),
  ).rejects.toThrow();
});

test("a task's checklist keeps its items, their marks and their order", async () => {
  const user = await newUser();
  const task = await createTask(user, { title: "Trip", date: "2026-11-13" });
  const [tickets, passport, charger] = ["Tickets", "Passport", "Charger"].map(
    (text) => ({ id: crypto.randomUUID(), text, completed: false }),
  );
  const checklistOf = async () => (await listTasks(user, week))[0].checklist;

  await updateTask(user, task.id, { checklist: [tickets, passport, charger] });
  expect(await checklistOf()).toEqual([tickets, passport, charger]);

  const done = { ...passport, completed: true };
  const renamed = { ...charger, text: "Phone charger" };
  await updateTask(user, task.id, { checklist: [renamed, done] });
  expect(await checklistOf()).toEqual([renamed, done]);
  expect((await listTasks(user, week))[0].title).toBe("Trip");

  await expect(
    updateTask(user, task.id, {
      checklist: [{ id: crypto.randomUUID(), text: " ", completed: false }],
    }),
  ).rejects.toThrow();
  expect(await checklistOf()).toEqual([renamed, done]);
});

test("a user cannot read, change or move another user's task details", async () => {
  const alice = await newUser();
  const bob = await newUser();
  const bobs = await createList(bob, { title: "Bob's" });
  const task = await createTask(alice, { title: "Secret", date: "2026-11-13" });
  const item = { id: crypto.randomUUID(), text: "Hidden", completed: false };
  await updateTask(alice, task.id, { notes: "Private", checklist: [item] });

  expect(
    await updateTask(bob, task.id, {
      notes: "Hacked",
      checklist: [],
      placement: { listId: bobs.id },
    }),
  ).toBeNull();
  await expect(
    updateTask(alice, task.id, { placement: { listId: bobs.id } }),
  ).rejects.toThrow();
  expect(await listTasks(alice, week)).toEqual([
    expect.objectContaining({
      date: "2026-11-13",
      notes: "Private",
      checklist: [item],
    }),
  ]);
});

test("a task moves to another date or into a list, landing at the end; staying put keeps its place", async () => {
  const user = await newUser();
  const inbox = await createList(user, { title: "Inbox" });
  await createTask(user, { title: "Waiting", listId: inbox.id });
  const gym = await createTask(user, { title: "Gym", date: "2026-11-13" });
  await createTask(user, { title: "Dentist", date: "2026-11-13" });
  await createTask(user, { title: "Haircut", date: "2026-11-10" });
  const titlesOn = async (date: string) =>
    (await listTasks(user, week))
      .filter((task) => task.date === date)
      .map((task) => task.title);

  await updateTask(user, gym.id, { placement: { date: "2026-11-13" } });
  expect(await titlesOn("2026-11-13")).toEqual(["Gym", "Dentist"]);

  expect(
    await updateTask(user, gym.id, { placement: { date: "2026-11-10" } }),
  ).toMatchObject({ date: "2026-11-10" });
  expect(await titlesOn("2026-11-10")).toEqual(["Haircut", "Gym"]);

  const moved = await updateTask(user, gym.id, {
    placement: { listId: inbox.id },
  });
  expect(moved).toMatchObject({ listId: inbox.id });
  expect(moved).not.toHaveProperty("date");
  const view = await readWeek(user, {}, new Date("2026-11-10T10:00:00Z"));
  expect(
    view.tasks
      .filter((task) => task.listId === inbox.id)
      .map((task) => task.title),
  ).toEqual(["Waiting", "Gym"]);
  expect(await titlesOn("2026-11-10")).toEqual(["Haircut"]);
});
