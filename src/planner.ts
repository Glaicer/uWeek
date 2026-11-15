import { and, asc, between, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { validCalendarDate } from "./calendar";
import { db } from "./db/client";
import { tasks } from "./db/schema";

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
