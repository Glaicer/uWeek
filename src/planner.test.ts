import { eq } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { db } from "./db/client";
import { tasks, users } from "./db/schema";
import {
  createList,
  createTask,
  deleteList,
  deleteTask,
  getTask,
  listLists,
  moveList,
  PlannerNotFoundError,
  queryTasks,
  readWeek,
  renameList,
  updateSettings,
  updateTask,
  type Task,
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

// why: these cases check the rows the planner stores and schedules, so the clock sits
// before every fixture here and the rollover has nothing to move
const readTasks = (userId: string, input: { from: string; to: string }) =>
  queryTasks(userId, input, new Date("2026-11-09T00:00:00Z"));

test("a user sees only their own tasks and cannot change or delete another user's", async () => {
  const alice = await newUser();
  const bob = await newUser();
  const task = await createTask(alice, {
    title: "Buy milk",
    date: "2026-11-14",
  });

  expect(await readTasks(bob, week)).toEqual([]);
  expect(
    await updateTask(bob, task.id, { title: "Hacked", completed: true }),
  ).toBeNull();
  expect(await deleteTask(bob, task.id)).toBe(false);

  expect(await readTasks(alice, week)).toEqual([
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
  expect((await readTasks(user, week)).map((task) => task.title)).toEqual([
    "Gym",
    "Call dad",
  ]);

  expect(await deleteTask(user, first.id)).toBe(true);
  expect((await readTasks(user, week)).map((task) => task.title)).toEqual([
    "Call dad",
  ]);
});

test("a blank title is rejected", async () => {
  const user = await newUser();
  await expect(
    createTask(user, { title: "   ", date: "2026-11-13" }),
  ).rejects.toThrow();
  expect(await readTasks(user, week)).toEqual([]);
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
    (await readTasks(other, week)).map((task) => [task.title, task.date]),
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

test("a user reorders tasks within a day and moves one to a given row of another day or list in one step", async () => {
  const user = await newUser();
  const list = await createList(user, { title: "Someday" });
  const now = new Date("2026-11-13T10:00:00Z");
  const titles = async () => {
    const { tasks } = await readWeek(user, {}, now);
    const of = (place: string) =>
      tasks
        .filter((task) => task.date === place || task.listId === place)
        .map((task) => task.title);
    return { tue: of("2026-11-10"), wed: of("2026-11-11"), list: of(list.id) };
  };
  const add = (title: string, date: string) =>
    createTask(user, { title, date });
  const gym = await add("Gym", "2026-11-10");
  const milk = await add("Milk", "2026-11-10");
  const call = await add("Call", "2026-11-10");
  await add("Read", "2026-11-11");
  const book = await add("Book", "2026-11-11");
  await createTask(user, { title: "Paint", listId: list.id });

  await updateTask(user, call.id, {
    placement: { date: "2026-11-10", index: 0 },
  });
  expect((await titles()).tue).toEqual(["Call", "Gym", "Milk"]);
  await updateTask(user, call.id, {
    placement: { date: "2026-11-10", index: 2 },
  });
  expect((await titles()).tue).toEqual(["Gym", "Milk", "Call"]);

  await updateTask(user, gym.id, {
    placement: { date: "2026-11-11", index: 1 },
  });
  await updateTask(user, milk.id, { placement: { listId: list.id, index: 0 } });
  await updateTask(user, book.id, {
    placement: { date: "2026-11-10", index: 9 },
  });
  expect(await titles()).toEqual({
    tue: ["Call", "Book"],
    wed: ["Read", "Gym"],
    list: ["Milk", "Paint"],
  });

  await updateTask(user, milk.id, {
    placement: { date: "2026-11-10", index: 1 },
  });
  expect((await titles()).tue).toEqual(["Call", "Milk", "Book"]);
  await expect(
    updateTask(user, milk.id, { placement: { date: "2026-11-10", index: -1 } }),
  ).rejects.toThrow();
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
  expect((await readTasks(user, week))[0]).toMatchObject({
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
  const checklistOf = async () => (await readTasks(user, week))[0].checklist;

  await updateTask(user, task.id, { checklist: [tickets, passport, charger] });
  expect(await checklistOf()).toEqual([tickets, passport, charger]);

  const done = { ...passport, completed: true };
  const renamed = { ...charger, text: "Phone charger" };
  await updateTask(user, task.id, { checklist: [renamed, done] });
  expect(await checklistOf()).toEqual([renamed, done]);
  expect((await readTasks(user, week))[0].title).toBe("Trip");

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
  expect(await readTasks(alice, week)).toEqual([
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
    (await readTasks(user, week))
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

const daily = { every: "day", interval: 1, until: null } as const;
const placesOf = (list: Task[]) =>
  list.map((task) => [task.date ?? task.listId, task.title, task.completed]);

test("a task made daily falls on every following day of the range, only for its owner", async () => {
  const user = await newUser();
  const other = await newUser();
  const task = await createTask(user, { title: "Stretch", date: "2026-11-12" });

  const made = await updateTask(user, task.id, { repeat: daily });
  expect(made).toMatchObject({
    id: task.id,
    date: "2026-11-12",
    recurrence: { occurrence: "2026-11-12", repeat: daily },
  });
  const listed = await readTasks(user, week);
  expect(placesOf(listed)).toEqual([
    ["2026-11-12", "Stretch", false],
    ["2026-11-13", "Stretch", false],
    ["2026-11-14", "Stretch", false],
    ["2026-11-15", "Stretch", false],
  ]);
  expect(listed[1]).toMatchObject({
    recurrence: { occurrence: "2026-11-13", repeat: daily },
  });
  expect(await readTasks(other, week)).toEqual([]);
  expect(await updateTask(other, listed[1].id, { completed: true })).toBeNull();
  expect(await deleteTask(other, listed[1].id)).toBe(false);
});

test("an occurrence is completed, renamed and deleted on its own and keeps its id", async () => {
  const user = await newUser();
  const task = await createTask(user, { title: "Read", date: "2026-11-09" });
  await updateTask(user, task.id, { repeat: daily });
  const [, tue, wed, thu] = await readTasks(user, week);

  expect(await updateTask(user, tue.id, { completed: true })).toMatchObject({
    id: tue.id,
    date: "2026-11-10",
    completed: true,
  });
  await updateTask(user, wed.id, { title: "Read a chapter" });
  expect(await deleteTask(user, thu.id)).toBe(true);

  const listed = await readTasks(user, week);
  expect(placesOf(listed)).toEqual([
    ["2026-11-09", "Read", false],
    ["2026-11-10", "Read", true],
    ["2026-11-11", "Read a chapter", false],
    ["2026-11-13", "Read", false],
    ["2026-11-14", "Read", false],
    ["2026-11-15", "Read", false],
  ]);
  expect(listed[1].id).toBe(tue.id);
});

test("this and following ends the old series the day before and starts a new one from this occurrence", async () => {
  const user = await newUser();
  const task = await createTask(user, { title: "Run", date: "2026-11-09" });
  await updateTask(user, task.id, { repeat: daily });
  const before = await readTasks(user, week);
  await updateTask(user, before[5].id, { completed: true });

  await updateTask(
    user,
    before[3].id,
    { title: "Run 5k", color: "green" },
    "following",
  );
  const after = await readTasks(user, week);
  expect(placesOf(after)).toEqual([
    ["2026-11-09", "Run", false],
    ["2026-11-10", "Run", false],
    ["2026-11-11", "Run", false],
    ["2026-11-12", "Run 5k", false],
    ["2026-11-13", "Run 5k", false],
    ["2026-11-14", "Run 5k", true],
    ["2026-11-15", "Run 5k", false],
  ]);
  expect(after[2].color).toBeNull();
  expect(after[6].color).toBe("green");
  expect(after[6].recurrence?.seriesId).not.toBe(after[2].recurrence?.seriesId);

  expect(await deleteTask(user, after[3].id, "following")).toBe(true);
  expect(placesOf(await readTasks(user, week))).toEqual([
    ["2026-11-09", "Run", false],
    ["2026-11-10", "Run", false],
    ["2026-11-11", "Run", false],
    ["2026-11-14", "Run 5k", true],
  ]);
});

test("changing the rule from an occurrence repeats from that day on the new rule; stopping it ends only that series", async () => {
  const user = await newUser();
  const task = await createTask(user, { title: "Gym", date: "2026-11-09" });
  await updateTask(user, task.id, { repeat: daily });
  const before = await readTasks(user, week);

  await updateTask(user, before[2].id, {
    repeat: { every: "week", interval: 1, weekdays: [3, 5], until: null },
  });
  expect(placesOf(await readTasks(user, week))).toEqual([
    ["2026-11-09", "Gym", false],
    ["2026-11-10", "Gym", false],
    ["2026-11-11", "Gym", false],
    ["2026-11-13", "Gym", false],
  ]);

  await updateTask(user, before[0].id, { repeat: null });
  const plain = await readTasks(user, week);
  expect(placesOf(plain)).toEqual([
    ["2026-11-09", "Gym", false],
    ["2026-11-11", "Gym", false],
    ["2026-11-13", "Gym", false],
  ]);
  expect(plain[0].recurrence).toBeUndefined();
});

test("deleting this and following leaves the days before and keeps completed occurrences as plain tasks", async () => {
  const user = await newUser();
  const task = await createTask(user, { title: "Walk", date: "2026-11-09" });
  await updateTask(user, task.id, { repeat: daily });
  const before = await readTasks(user, week);
  await updateTask(user, before[5].id, { completed: true });

  expect(await deleteTask(user, before[2].id, "following")).toBe(true);
  const after = await readTasks(user, week);
  expect(placesOf(after)).toEqual([
    ["2026-11-09", "Walk", false],
    ["2026-11-10", "Walk", false],
    ["2026-11-14", "Walk", true],
  ]);
  expect(after[2].recurrence).toBeUndefined();
  expect(
    await readTasks(user, { from: "2026-11-16", to: "2026-11-22" }),
  ).toEqual([]);
});

test("a monthly series on the 31st can move to the 1st of the next month", async () => {
  const user = await newUser();
  const task = await createTask(user, { title: "Rent", date: "2027-01-31" });
  await updateTask(user, task.id, {
    repeat: { every: "month", interval: 1, monthEnd: "overflow", until: null },
  });
  expect(
    (await readTasks(user, { from: "2027-02-01", to: "2027-03-31" })).map(
      (task) => task.date,
    ),
  ).toEqual(["2027-03-01", "2027-03-31"]);
});

test("only a dated task repeats", async () => {
  const user = await newUser();
  const list = await createList(user, { title: "Someday" });
  const task = await createTask(user, { title: "Idea", listId: list.id });
  await expect(updateTask(user, task.id, { repeat: daily })).rejects.toThrow();
});

test("missed occurrences of past days roll over to today and remember their day; future ones stay", async () => {
  const user = await newUser();
  await updateSettings(user, { timeZone: "Europe/Moscow" });
  const task = await createTask(user, { title: "Water", date: "2026-11-10" });
  await updateTask(user, task.id, { repeat: daily });
  const [, wed] = await readTasks(user, week);
  await updateTask(user, wed.id, { completed: true });
  const now = new Date("2026-11-13T10:00:00+03:00");

  for (let read = 0; read < 2; read++) {
    const { tasks } = await readWeek(user, {}, now);
    expect(
      tasks.map((task) => [
        task.date,
        task.recurrence?.occurrence,
        task.completed,
      ]),
    ).toEqual([
      ["2026-11-11", "2026-11-11", true],
      ["2026-11-13", "2026-11-10", false],
      ["2026-11-13", "2026-11-12", false],
      ["2026-11-13", "2026-11-13", false],
      ["2026-11-14", "2026-11-14", false],
      ["2026-11-15", "2026-11-15", false],
    ]);
  }
});

test("an occurrence moved to another day or a list stays there and the series does not bring it back", async () => {
  const user = await newUser();
  const list = await createList(user, { title: "Someday" });
  const task = await createTask(user, { title: "Plants", date: "2026-11-09" });
  await updateTask(user, task.id, {
    repeat: { every: "week", interval: 1, weekdays: [1, 3], until: null },
  });
  const [, wed] = await readTasks(user, week);

  await updateTask(user, wed.id, { placement: { date: "2026-11-14" } });
  expect(placesOf(await readTasks(user, week))).toEqual([
    ["2026-11-09", "Plants", false],
    ["2026-11-14", "Plants", false],
  ]);
  await updateTask(user, wed.id, { placement: { listId: list.id } });
  const { tasks } = await readWeek(user, {}, new Date("2026-11-09T10:00:00Z"));
  expect(placesOf(tasks)).toEqual([
    ["2026-11-09", "Plants", false],
    [list.id, "Plants", false],
  ]);
});

test("changing the rule of a missed occurrence keeps the other missed ones on today as plain tasks", async () => {
  const user = await newUser();
  await updateSettings(user, { timeZone: "Europe/Moscow" });
  const task = await createTask(user, { title: "Read", date: "2026-11-10" });
  await updateTask(user, task.id, { repeat: daily });
  const now = new Date("2026-11-13T10:00:00+03:00");
  const [missed] = (await readWeek(user, {}, now)).tasks;

  await updateTask(user, missed.id, {
    repeat: { every: "week", interval: 1, weekdays: [5], until: null },
  });
  const { tasks } = await readWeek(user, {}, now);
  expect(
    tasks.map((task) => [task.date, task.recurrence?.occurrence ?? null]),
  ).toEqual([
    ["2026-11-13", "2026-11-13"],
    ["2026-11-13", null],
    ["2026-11-13", null],
  ]);
});

test("queryTasks filters stored and virtual tasks by placement status and literal text", async () => {
  const user = await newUser();
  const other = await newUser();
  const now = new Date("2026-11-20T10:00:00Z");

  const series = await createTask(user, {
    title: "Standup",
    date: "2026-11-20",
  });
  await updateTask(user, series.id, { repeat: daily });
  const [, saturday] = await readTasks(user, {
    from: "2026-11-20",
    to: "2026-11-21",
  });
  await updateTask(user, saturday.id, { notes: "Bring the board" });
  await updateTask(user, series.id, { completed: true });

  await createTask(user, {
    title: "Save 50% today",
    date: "2026-11-22",
  });
  await createTask(user, { title: "Save 50 today", date: "2026-11-22" });
  await createTask(user, {
    title: "Plan_A",
    date: "2026-11-22",
  });
  await createTask(user, { title: "Plan A", date: "2026-11-22" });

  const list = await createList(user, { title: "Inbox" });
  await createTask(user, { title: "Someday item", listId: list.id });
  const done = await createTask(user, { title: "Done idea", listId: list.id });
  await updateTask(user, done.id, { completed: true });

  const foreignList = await createList(other, { title: "Theirs" });
  await createTask(other, { title: "Not mine", date: "2026-11-22" });

  const range = { from: "2026-11-20", to: "2026-11-22" };
  expect(
    (await queryTasks(user, range, now)).map((task) => [
      task.date,
      task.title,
      task.completed,
    ]),
  ).toEqual([
    ["2026-11-20", "Standup", true],
    ["2026-11-21", "Standup", false],
    ["2026-11-22", "Save 50% today", false],
    ["2026-11-22", "Save 50 today", false],
    ["2026-11-22", "Plan_A", false],
    ["2026-11-22", "Plan A", false],
    ["2026-11-22", "Standup", false],
  ]);
  expect(
    (await queryTasks(user, { ...range, completed: "false" }, now)).map(
      (task) => [task.date, task.title],
    ),
  ).toEqual([
    ["2026-11-21", "Standup"],
    ["2026-11-22", "Save 50% today"],
    ["2026-11-22", "Save 50 today"],
    ["2026-11-22", "Plan_A"],
    ["2026-11-22", "Plan A"],
    ["2026-11-22", "Standup"],
  ]);
  expect(
    (await queryTasks(user, { ...range, completed: "true" }, now)).map(
      (task) => task.title,
    ),
  ).toEqual(["Standup"]);

  expect(
    (await queryTasks(user, { ...range, q: "BOARD" }, now)).map(
      (task) => task.id,
    ),
  ).toEqual([saturday.id]);
  expect(
    (await queryTasks(user, { ...range, q: "%" }, now)).map(
      (task) => task.title,
    ),
  ).toEqual(["Save 50% today"]);
  expect(
    (await queryTasks(user, { ...range, q: "_" }, now)).map(
      (task) => task.title,
    ),
  ).toEqual(["Plan_A"]);

  expect(
    (await queryTasks(user, { listId: list.id }, now)).map(
      (task) => task.title,
    ),
  ).toEqual(["Someday item", "Done idea"]);
  expect(
    (await queryTasks(user, { listId: list.id, completed: "false" }, now)).map(
      (task) => task.title,
    ),
  ).toEqual(["Someday item"]);
  expect(
    (await queryTasks(user, { listId: list.id, completed: "true" }, now)).map(
      (task) => task.title,
    ),
  ).toEqual(["Done idea"]);

  await expect(
    queryTasks(user, { listId: foreignList.id }, now),
  ).rejects.toBeInstanceOf(PlannerNotFoundError);
  await expect(
    queryTasks(user, { listId: crypto.randomUUID() }, now),
  ).rejects.toBeInstanceOf(PlannerNotFoundError);

  expect(await listLists(user)).toEqual([{ id: list.id, title: "Inbox" }]);
  expect(await listLists(other)).toEqual([
    { id: foreignList.id, title: "Theirs" },
  ]);
});

test("task queries and week reads share timezone rollover without duplicates", async () => {
  const user = await newUser();
  await updateSettings(user, { timeZone: "Europe/Moscow" });
  const now = new Date("2026-11-09T22:30:00Z");
  const range = { from: "2026-11-08", to: "2026-11-10" };

  await createTask(user, { title: "Overdue", date: "2026-11-08" });
  const series = await createTask(user, {
    title: "Missed",
    date: "2026-11-08",
  });
  await updateTask(user, series.id, { repeat: daily });

  const first = await queryTasks(user, range, now);
  const week = await readWeek(user, {}, now);
  const again = await queryTasks(user, range, now);

  expect(again).toEqual(first);
  const shape = (tasks: Task[]) =>
    tasks
      .map((task) => [
        task.date,
        task.title,
        task.recurrence?.occurrence ?? null,
      ])
      .sort();
  expect(shape(first)).toEqual([
    ["2026-11-10", "Missed", "2026-11-08"],
    ["2026-11-10", "Missed", "2026-11-09"],
    ["2026-11-10", "Missed", "2026-11-10"],
    ["2026-11-10", "Overdue", null],
  ]);
  expect(
    shape(week.tasks.filter((task) => task.date! <= "2026-11-10")),
  ).toEqual(shape(first));
  expect(week.today).toBe("2026-11-10");

  const other = await newUser();
  await createTask(other, { title: "No zone", date: "2026-11-08" });
  expect(
    (
      await queryTasks(other, { from: "2026-11-08", to: "2026-11-08" }, now)
    ).map((task) => [task.date, task.title]),
  ).toEqual([["2026-11-08", "No zone"]]);
});

test("getTask reads stored and virtual occurrences without materializing a future one", async () => {
  const user = await newUser();
  const other = await newUser();
  const now = new Date("2026-11-09T10:00:00Z");
  const countRows = async (id: string) =>
    (await db.select().from(tasks).where(eq(tasks.userId, id))).length;

  const plain = await createTask(user, {
    title: "Plain",
    date: "2026-11-09",
  });
  expect(await getTask(user, plain.id, now)).toEqual(plain);

  const first = await createTask(user, {
    title: "Repeat",
    date: "2026-11-09",
  });
  const started = await updateTask(user, first.id, { repeat: daily });
  const seriesId = started!.recurrence!.seriesId;
  const before = await countRows(user);

  const virtualId = `${seriesId}_2026-11-12`;
  expect(await getTask(user, virtualId, now)).toMatchObject({
    id: virtualId,
    title: "Repeat",
    date: "2026-11-12",
    completed: false,
    recurrence: { seriesId, occurrence: "2026-11-12" },
  });
  expect(await countRows(user)).toBe(before);
  expect(await getTask(user, `${seriesId}_2026-11-09`, now)).toEqual(
    await getTask(user, first.id, now),
  );

  const tenth = `${seriesId}_2026-11-10`;
  await updateTask(user, tenth, { placement: { date: "2026-11-20" } });
  expect(await getTask(user, tenth, now)).toMatchObject({
    id: tenth,
    date: "2026-11-20",
    recurrence: { occurrence: "2026-11-10" },
  });

  await deleteTask(user, `${seriesId}_2026-11-11`);
  expect(await getTask(user, `${seriesId}_2026-11-11`, now)).toBeNull();

  expect(await getTask(user, crypto.randomUUID(), now)).toBeNull();
  expect(await getTask(user, `${seriesId}_2026-11-01`, now)).toBeNull();
  expect(await getTask(other, plain.id, now)).toBeNull();

  const foreign = await createTask(other, {
    title: "Theirs",
    date: "2026-11-09",
  });
  const foreignSeries = await updateTask(other, foreign.id, { repeat: daily });
  const foreignId = foreignSeries!.recurrence!.seriesId;
  expect(await getTask(user, `${foreignId}_2026-11-12`, now)).toBeNull();
  expect(await getTask(other, `${foreignId}_2026-11-12`, now)).toMatchObject({
    title: "Theirs",
    date: "2026-11-12",
  });
});

test("deleting this and following removes an unfinished occurrence moved off its day", async () => {
  const user = await newUser();
  const task = await createTask(user, {
    title: "Walk",
    date: "2026-11-09",
  });
  await updateTask(user, task.id, { repeat: daily });
  const before = await readTasks(user, week);

  await updateTask(user, before[2].id, {
    placement: { date: "2026-11-20" },
  });
  expect(await deleteTask(user, before[1].id, "following")).toBe(true);
  expect(
    placesOf(await readTasks(user, { from: "2026-11-09", to: "2026-11-30" })),
  ).toEqual([["2026-11-09", "Walk", false]]);
});

test("changing the rule deletes materialized unfinished occurrences after the split", async () => {
  const user = await newUser();
  const task = await createTask(user, {
    title: "Gym",
    date: "2026-11-09",
  });
  await updateTask(user, task.id, { repeat: daily });
  const before = await readTasks(user, week);
  await updateTask(user, before[2].id, { completed: true });
  await updateTask(user, before[2].id, { completed: false });

  await updateTask(
    user,
    before[1].id,
    {
      repeat: { every: "week", interval: 1, weekdays: [2], until: null },
    },
    "following",
  );
  expect(
    placesOf(await readTasks(user, { from: "2026-11-09", to: "2026-11-30" })),
  ).toEqual([
    ["2026-11-09", "Gym", false],
    ["2026-11-10", "Gym", false],
    ["2026-11-17", "Gym", false],
    ["2026-11-24", "Gym", false],
  ]);
});
