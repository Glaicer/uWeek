import {
  and,
  asc,
  between,
  eq,
  inArray,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { todayIn, validCalendarDate, weekOf, type WeekStart } from "./calendar";
import { db } from "./db/client";
import { checklistItems, lists, tasks, users } from "./db/schema";
import { taskColorValues, type Placement, type TaskColor } from "./model";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export type Task = {
  id: string;
  title: string;
  completed: boolean;
  notes: string;
  color: TaskColor | null;
  checklist: ChecklistItem[];
} & Placement;

export interface TaskList {
  id: string;
  title: string;
}

const isoDate = z.string().refine(validCalendarDate, "Invalid date");
const title = z.string().trim().min(1).max(500);
const taskId = z.uuid();
const range = z.object({ from: isoDate, to: isoDate });
const placement = z.xor([
  z.object({ date: isoDate }),
  z.object({ listId: z.uuid() }),
]);
const newTask = z.xor([
  z.object({ title, date: isoDate }),
  z.object({ title, listId: z.uuid() }),
]);
const newList = z.object({ title });
const listId = z.uuid();
const listMove = z.object({ to: z.int().min(0) });
const edits = z
  .object({
    title: title.optional(),
    completed: z.boolean().optional(),
    notes: z.string().max(10_000).optional(),
    color: z.enum(taskColorValues).nullable().optional(),
    checklist: z
      .array(z.object({ id: z.uuid(), text: title, completed: z.boolean() }))
      .max(200)
      .optional(),
    placement: placement.optional(),
  })
  .refine(
    (edits) => Object.values(edits).some((edit) => edit !== undefined),
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
  lists: TaskList[];
  tasks: Task[];
}

const taskColumns = {
  id: tasks.id,
  title: tasks.title,
  date: tasks.date,
  listId: tasks.listId,
  completed: sql<boolean>`${tasks.completedAt} is not null`,
  notes: tasks.notes,
  color: tasks.color,
};

type TaskRecord = Omit<Task, "date" | "listId"> & {
  date: string | null;
  listId: string | null;
};

function toTask({ date, listId, ...task }: TaskRecord): Task {
  if (date !== null) return { ...task, date };
  if (listId !== null) return { ...task, listId };
  throw new Error(`Task ${task.id} has neither a date nor a list`);
}

const taskOrder = [
  asc(tasks.date),
  asc(tasks.position),
  asc(tasks.createdAt),
  asc(tasks.id),
];

const listColumns = { id: lists.id, title: lists.title };
const listOrder = [asc(lists.position), asc(lists.createdAt), asc(lists.id)];

async function withChecklists(
  executor: Pick<typeof db, "select">,
  rows: Omit<TaskRecord, "checklist">[],
): Promise<Task[]> {
  const items = rows.length
    ? await executor
        .select({
          taskId: checklistItems.taskId,
          id: checklistItems.id,
          text: checklistItems.text,
          completed: checklistItems.completed,
        })
        .from(checklistItems)
        .where(
          inArray(
            checklistItems.taskId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(checklistItems.position))
    : [];
  return rows.map((row) =>
    toTask({
      ...row,
      checklist: items
        .filter((item) => item.taskId === row.id)
        .map(({ id, text, completed }) => ({ id, text, completed })),
    }),
  );
}

const ownedList = (userId: string, id: string) =>
  and(eq(lists.userId, userId), eq(lists.id, listId.parse(id)));

const owned = (userId: string, id: string) =>
  and(eq(tasks.userId, userId), eq(tasks.id, taskId.parse(id)));

export async function listTasks(
  userId: string,
  input: z.input<typeof range>,
): Promise<Task[]> {
  const { from, to } = range.parse(input);
  const rows = await db
    .select(taskColumns)
    .from(tasks)
    .where(and(eq(tasks.userId, userId), between(tasks.date, from, to)))
    .orderBy(...taskOrder);
  return withChecklists(db, rows);
}

async function listsAndTheirTasks(userId: string, from: string, to: string) {
  const [userLists, rows] = await Promise.all([
    db
      .select(listColumns)
      .from(lists)
      .where(eq(lists.userId, userId))
      .orderBy(...listOrder),
    db
      .select(taskColumns)
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          or(between(tasks.date, from, to), isNotNull(tasks.listId)),
        ),
      )
      .orderBy(...taskOrder),
  ]);
  return { lists: userLists, tasks: await withChecklists(db, rows) };
}

type TaskPlacement = z.output<typeof placement>;

const endOf = (userId: string, place: TaskPlacement) =>
  sql`(select coalesce(max(${tasks.position}), -1) + 1 from ${tasks} where ${tasks.userId} = ${userId} and ${"date" in place ? eq(tasks.date, place.date) : eq(tasks.listId, place.listId)})`;

export async function createTask(
  userId: string,
  input: z.input<typeof newTask>,
): Promise<Task> {
  const { title, ...placement } = newTask.parse(input);
  const [task] = await db
    .insert(tasks)
    .values({
      id: crypto.randomUUID(),
      userId,
      title,
      ...placement,
      position: endOf(userId, placement),
    })
    .returning(taskColumns);
  return toTask({ ...task, checklist: [] });
}

export async function createList(
  userId: string,
  input: z.input<typeof newList>,
): Promise<TaskList> {
  const { title } = newList.parse(input);
  const [list] = await db
    .insert(lists)
    .values({
      id: crypto.randomUUID(),
      userId,
      title,
      position: sql`(select coalesce(max(${lists.position}), -1) + 1 from ${lists} where ${lists.userId} = ${userId})`,
    })
    .returning(listColumns);
  return list;
}

export async function renameList(
  userId: string,
  id: string,
  input: z.input<typeof newList>,
): Promise<TaskList | null> {
  const { title } = newList.parse(input);
  const [list] = await db
    .update(lists)
    .set({ title })
    .where(ownedList(userId, id))
    .returning(listColumns);
  return list ?? null;
}

export async function moveList(
  userId: string,
  id: string,
  input: z.input<typeof listMove>,
): Promise<boolean> {
  const { to } = listMove.parse(input);
  listId.parse(id);
  return db.transaction(async (tx) => {
    const order = (
      await tx
        .select({ id: lists.id })
        .from(lists)
        .where(eq(lists.userId, userId))
        .orderBy(...listOrder)
        .for("update")
    ).map((list) => list.id);
    const from = order.indexOf(id);
    if (from < 0) return false;
    order.splice(from, 1);
    order.splice(Math.min(to, order.length), 0, id);
    for (const [position, list] of order.entries())
      await tx
        .update(lists)
        .set({ position })
        .where(and(eq(lists.userId, userId), eq(lists.id, list)));
    return true;
  });
}

export async function deleteList(userId: string, id: string): Promise<boolean> {
  listId.parse(id);
  return db.transaction(async (tx) => {
    const userLists = await tx
      .select({ id: lists.id })
      .from(lists)
      .where(eq(lists.userId, userId))
      .for("update");
    // why: the Someday band always has a list to write into
    if (userLists.length < 2 || !userLists.some((list) => list.id === id))
      return false;
    await tx.delete(lists).where(ownedList(userId, id));
    return true;
  });
}

export async function updateTask(
  userId: string,
  id: string,
  input: TaskEdits,
): Promise<Task | null> {
  const { completed, checklist, placement, ...fields } = edits.parse(input);
  return db.transaction(async (tx) => {
    const [task] = await tx
      .update(tasks)
      .set({
        ...fields,
        completedAt:
          completed === undefined ? undefined : completed ? sql`now()` : null,
        ...(placement && moveTo(userId, placement)),
        // why: an edit of the checklist alone leaves nothing else to set, and drizzle refuses an empty set
        updatedAt: new Date(),
      })
      .where(owned(userId, id))
      .returning(taskColumns);
    if (!task) return null;
    if (checklist) {
      await tx.delete(checklistItems).where(eq(checklistItems.taskId, task.id));
      if (checklist.length)
        await tx.insert(checklistItems).values(
          checklist.map((item, position) => ({
            ...item,
            taskId: task.id,
            position,
          })),
        );
    }
    const [read] = await withChecklists(tx, [task]);
    return read;
  });
}

function moveTo(userId: string, to: TaskPlacement) {
  const date = "date" in to ? to.date : null;
  const listId = "listId" in to ? to.listId : null;
  // why: a task already in that place keeps its row; one that arrives goes to the end
  return {
    date,
    listId,
    position: sql`case when ${tasks.date} is not distinct from ${date}::date and ${tasks.listId} is not distinct from ${listId}::text then ${tasks.position} else ${endOf(userId, to)} end`,
  };
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
    ...(await listsAndTheirTasks(userId, dates[0], dates[6])),
  };
}
