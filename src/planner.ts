import { and, asc, between, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { todayIn, validCalendarDate, weekOf, type WeekStart } from "./calendar";
import { db } from "./db/client";
import { tasks, users } from "./db/schema";

export interface DayTask {
  id: string;
  title: string;
  date: string;
  completed: boolean;
}

const isoDate = z.string().refine(validCalendarDate, "Invalid date");
const title = z.string().trim().min(1).max(500);
const taskId = z.uuid();
const range = z.object({ from: isoDate, to: isoDate });
const newTask = z.object({ title, date: isoDate });
const edits = z
  .object({ title: title.optional(), completed: z.boolean().optional() })
  .refine(
    (edits) => edits.title !== undefined || edits.completed !== undefined,
    "Nothing to change",
  );

export type TaskEdits = z.input<typeof edits>;

const timeZone = z.string().refine((zone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}, "Unknown time zone");
const settings = z
  .object({
    timeZone: timeZone.optional(),
    weekStartsOn: z.coerce
      .number()
      .pipe(z.literal([0, 1]))
      .optional(),
  })
  .refine(
    (settings) =>
      settings.timeZone !== undefined || settings.weekStartsOn !== undefined,
    "Nothing to change",
  );
const weekQuery = z.object({ week: isoDate.optional() });

export interface WeekView {
  timeZone: string | null;
  weekStartsOn: WeekStart;
  today: string;
  dates: string[];
  tasks: DayTask[];
}

const dayTask = {
  id: tasks.id,
  title: tasks.title,
  date: sql<string>`${tasks.date}`,
  completed: sql<boolean>`${tasks.completedAt} is not null`,
};

const owned = (userId: string, id: string) =>
  and(eq(tasks.userId, userId), eq(tasks.id, taskId.parse(id)));

export async function listTasks(
  userId: string,
  input: z.input<typeof range>,
): Promise<DayTask[]> {
  const { from, to } = range.parse(input);
  return db
    .select(dayTask)
    .from(tasks)
    .where(and(eq(tasks.userId, userId), between(tasks.date, from, to)))
    .orderBy(
      asc(tasks.date),
      asc(tasks.position),
      asc(tasks.createdAt),
      asc(tasks.id),
    );
}

export async function createTask(
  userId: string,
  input: z.input<typeof newTask>,
): Promise<DayTask> {
  const { title, date } = newTask.parse(input);
  const [task] = await db
    .insert(tasks)
    .values({
      id: crypto.randomUUID(),
      userId,
      title,
      date,
      position: sql`(select coalesce(max(${tasks.position}), -1) + 1 from ${tasks} where ${tasks.userId} = ${userId} and ${tasks.date} = ${date})`,
    })
    .returning(dayTask);
  return task;
}

export async function updateTask(
  userId: string,
  id: string,
  input: TaskEdits,
): Promise<DayTask | null> {
  const { title, completed } = edits.parse(input);
  const [task] = await db
    .update(tasks)
    .set({
      title,
      completedAt:
        completed === undefined ? undefined : completed ? sql`now()` : null,
    })
    .where(owned(userId, id))
    .returning(dayTask);
  return task ?? null;
}

export async function deleteTask(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(tasks)
    .where(owned(userId, id))
    .returning({ id: tasks.id });
  return deleted.length > 0;
}

export async function updateSettings(
  userId: string,
  input: z.input<typeof settings>,
): Promise<void> {
  await db.update(users).set(settings.parse(input)).where(eq(users.id, userId));
}

async function rollOverUnfinishedTasks(userId: string, today: string) {
  await db.execute(sql`
    with moving as (
      select ${tasks.id} as id,
        row_number() over (order by ${tasks.date}, ${tasks.position}, ${tasks.id}) as n
      from ${tasks}
      where ${tasks.userId} = ${userId}
        and ${tasks.date} < ${today}
        and ${tasks.completedAt} is null
    )
    update ${tasks}
    set date = ${today},
      position = moving.n + (
        select coalesce(max(position), -1) from ${tasks}
        where user_id = ${userId} and date = ${today}
      )
    from moving
    where ${tasks.id} = moving.id`);
}

export async function readWeek(
  userId: string,
  input: z.input<typeof weekQuery>,
  now: Date,
): Promise<WeekView> {
  const { week } = weekQuery.parse(input);
  const [user] = await db
    .select({ timeZone: users.timeZone, weekStartsOn: users.weekStartsOn })
    .from(users)
    .where(eq(users.id, userId));
  // why: before the browser reports a zone "today" is only a guess, so nothing is moved onto it
  const today = todayIn(user.timeZone ?? "UTC", now);
  if (user.timeZone) await rollOverUnfinishedTasks(userId, today);
  const dates = weekOf(week ?? today, user.weekStartsOn);
  return {
    timeZone: user.timeZone,
    weekStartsOn: user.weekStartsOn,
    today,
    dates,
    tasks: await listTasks(userId, { from: dates[0], to: dates[6] }),
  };
}
