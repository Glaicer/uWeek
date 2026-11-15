import { afterAll, expect, test } from "vitest";
import { db } from "./db/client";
import { tasks, users } from "./db/schema";
import {
  createTask,
  deleteTask,
  listTasks,
  readWeek,
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
    { id: task.id, title: "Buy milk", date: "2026-11-14", completed: false },
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
  const task = { userId, title: "Nowhere", position: 0 };
  await expect(
    db.insert(tasks).values({ ...task, id: crypto.randomUUID() }),
  ).rejects.toThrow();
  await expect(
    db.insert(tasks).values({
      ...task,
      id: crypto.randomUUID(),
      date: "2026-11-13",
      listId: "inbox",
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
