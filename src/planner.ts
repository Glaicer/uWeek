import {
  and,
  asc,
  between,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  addDays,
  todayIn,
  validCalendarDate,
  weekOf,
  type WeekStart,
} from "./calendar";
import { db } from "./db/client";
import { checklistItems, lists, tasks, taskSeries, users } from "./db/schema";
import { occurrences, type Repeat, type Series } from "./recurrence";
import type { SeriesField } from "./task-edits";
import {
  edits,
  listId,
  listMove,
  newList,
  newTask,
  occurrenceId,
  placement,
  range,
  scope,
  searchQuery,
  settings,
  taskId,
  taskQuery,
  weekQuery,
  type ChecklistItem,
  type Recurrence,
  type Task,
  type TaskEdits,
  type TaskList,
} from "./planner-schemas";

export type { ChecklistItem, Recurrence, Task, TaskEdits, TaskList };
export { weekQuery };

export type Scope = "this" | "following";

export interface SearchResult {
  id: string;
  title: string;
  notes: string;
  repeats: boolean;
}

export interface SearchPage {
  items: SearchResult[];
  nextCursor: number | null;
}

export async function searchTasks(
  userId: string,
  input: z.input<typeof searchQuery>,
): Promise<SearchPage> {
  const { query, cursor } = searchQuery.parse(input);
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const size = 20;
  const matches = () =>
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        notes: tasks.notes,
        repeats: sql<boolean>`false`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.seriesId),
          isNull(tasks.deletedAt),
          or(ilike(tasks.title, pattern), ilike(tasks.notes, pattern)),
        ),
      )
      .unionAll(
        db
          .select({
            id: taskSeries.id,
            title: taskSeries.title,
            notes: taskSeries.notes,
            repeats: sql<boolean>`true`,
          })
          .from(taskSeries)
          .where(
            and(
              eq(taskSeries.userId, userId),
              or(
                isNull(taskSeries.endsOn),
                sql`${taskSeries.endsOn} >= ${taskSeries.startsOn}`,
                sql`exists (
                select 1 from ${tasks}
                where ${tasks.userId} = ${userId}
                  and ${tasks.seriesId} = ${taskSeries.id}
                  and ${tasks.deletedAt} is null
              )`,
              ),
              or(
                ilike(taskSeries.title, pattern),
                ilike(taskSeries.notes, pattern),
              ),
            ),
          ),
      )
      .orderBy(sql`title`, sql`id`)
      .limit(size + 1);
  const items: SearchResult[] = [];
  let offset = cursor;
  for (;;) {
    const rows = await matches().offset(offset);
    for (const row of rows) {
      const at = offset++;
      if (row.repeats && !(await searchTarget(userId, row.id))) continue;
      if (items.length === size) return { items, nextCursor: at };
      items.push(row);
    }
    if (rows.length < size + 1) return { items, nextCursor: null };
  }
}

export interface WeekView {
  timeZone: string | null;
  weekStartsOn: WeekStart;
  today: string;
  dates: string[];
  lists: TaskList[];
  tasks: Task[];
  focusId?: string;
}

const taskColumns = {
  id: tasks.id,
  title: tasks.title,
  date: tasks.date,
  listId: tasks.listId,
  completed: sql<boolean>`${tasks.completedAt} is not null`,
  notes: tasks.notes,
  color: tasks.color,
  seriesId: tasks.seriesId,
  occurrence: tasks.occurrence,
};

type TaskRecord = Omit<Task, "date" | "listId" | "recurrence"> & {
  date: string | null;
  listId: string | null;
  seriesId: string | null;
  occurrence: string | null;
};

type SeriesRow = typeof taskSeries.$inferSelect;

function repeatOf(row: SeriesRow): Repeat {
  const base = { interval: row.interval, until: row.endsOn };
  if (row.every === "week")
    return { ...base, every: "week", weekdays: row.weekdays! };
  if (row.every === "month")
    return { ...base, every: "month", monthEnd: row.monthEnd! };
  return { ...base, every: row.every };
}

const seriesOf = (row: SeriesRow): Series => ({
  repeat: repeatOf(row),
  anchor: row.anchor,
  startsOn: row.startsOn,
  weekStartsOn: row.weekStartsOn,
});

const ruleColumns = (repeat: Repeat) => ({
  every: repeat.every,
  interval: repeat.interval,
  endsOn: repeat.until,
  weekdays: repeat.every === "week" ? repeat.weekdays : null,
  monthEnd: repeat.every === "month" ? repeat.monthEnd : null,
});

function toTask(
  { date, listId, seriesId, occurrence, ...fields }: TaskRecord,
  series: ReadonlyMap<string, SeriesRow>,
): Task {
  const recurrence =
    seriesId !== null && occurrence !== null
      ? {
          recurrence: {
            seriesId,
            occurrence,
            repeat: repeatOf(series.get(seriesId)!),
          },
        }
      : {};
  if (date !== null) return { ...fields, ...recurrence, date };
  if (listId !== null) return { ...fields, ...recurrence, listId };
  throw new Error(`Task ${fields.id} has neither a date nor a list`);
}

const occurrenceIdOf = (seriesId: string, date: string) =>
  `${seriesId}_${date}`;

// why: list tasks sort after every dated one
const dayOf = (task: Task) => ("date" in task ? task.date : "~");

function virtualTask(series: SeriesRow, date: string): Task {
  return {
    id: occurrenceIdOf(series.id, date),
    title: series.title,
    completed: false,
    notes: series.notes,
    color: series.color,
    checklist: series.checklist.map((text) => ({
      id: crypto.randomUUID(),
      text,
      completed: false,
    })),
    recurrence: {
      seriesId: series.id,
      occurrence: date,
      repeat: repeatOf(series),
    },
    date,
  };
}

const taskOrder = [
  asc(tasks.date),
  asc(tasks.position),
  asc(tasks.createdAt),
  asc(tasks.id),
];

const listColumns = { id: lists.id, title: lists.title };
const listOrder = [asc(lists.position), asc(lists.createdAt), asc(lists.id)];

type Executor = Pick<typeof db, "select">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function seriesById(executor: Executor, ids: string[]) {
  const rows = ids.length
    ? await executor
        .select()
        .from(taskSeries)
        .where(inArray(taskSeries.id, [...new Set(ids)]))
    : [];
  return new Map(rows.map((row) => [row.id, row]));
}

async function withChecklists(
  executor: Executor,
  rows: Omit<TaskRecord, "checklist">[],
): Promise<Task[]> {
  const series = await seriesById(
    executor,
    rows.flatMap((row) => (row.seriesId ? [row.seriesId] : [])),
  );
  const byTask = new Map<string, ChecklistItem[]>();
  for (let offset = 0; offset < rows.length; offset += 1000) {
    const items = await executor
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
          rows.slice(offset, offset + 1000).map((row) => row.id),
        ),
      )
      .orderBy(asc(checklistItems.position));
    for (const { taskId, ...item } of items) {
      const checklist = byTask.get(taskId);
      if (checklist) checklist.push(item);
      else byTask.set(taskId, [item]);
    }
  }
  return rows.map((row) =>
    toTask(
      {
        ...row,
        checklist: byTask.get(row.id) ?? [],
      },
      series,
    ),
  );
}

async function withOccurrences(
  executor: Executor,
  userId: string,
  rows: Omit<TaskRecord, "checklist">[],
  from: string,
  to: string,
): Promise<Task[]> {
  const [read, series] = await Promise.all([
    withChecklists(executor, rows),
    executor
      .select()
      .from(taskSeries)
      .where(
        and(
          eq(taskSeries.userId, userId),
          sql`${taskSeries.startsOn} <= ${to}`,
          or(isNull(taskSeries.endsOn), sql`${taskSeries.endsOn} >= ${from}`),
        ),
      )
      .orderBy(asc(taskSeries.createdAt), asc(taskSeries.id)),
  ]);
  const taken = new Set(
    (series.length
      ? await executor
          .select({ seriesId: tasks.seriesId, occurrence: tasks.occurrence })
          .from(tasks)
          .where(
            and(
              inArray(
                tasks.seriesId,
                series.map((row) => row.id),
              ),
              between(tasks.occurrence, from, to),
            ),
          )
      : []
    ).map((row) => occurrenceIdOf(row.seriesId!, row.occurrence!)),
  );
  const virtual = series.flatMap((row) =>
    occurrences(seriesOf(row), from, to)
      .map((date) => virtualTask(row, date))
      .filter((task) => !taken.has(task.id)),
  );
  return [...read, ...virtual].sort((a, b) =>
    dayOf(a) === dayOf(b) ? 0 : dayOf(a) < dayOf(b) ? -1 : 1,
  );
}

const ownedList = (userId: string, id: string) =>
  and(eq(lists.userId, userId), eq(lists.id, listId.parse(id)));

const owned = (userId: string, id: string) =>
  and(eq(tasks.userId, userId), eq(tasks.id, taskId.parse(id)));

// why: stored rows and the occurrences they replace are read from one snapshot, or a concurrent save could hide an occurrence
const snapshot = <T>(read: (tx: Transaction) => Promise<T>) =>
  db.transaction(read, {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });

export async function listTasks(
  userId: string,
  input: z.input<typeof range>,
): Promise<Task[]> {
  const { from, to } = range.parse(input);
  return snapshot(async (tx) =>
    withOccurrences(
      tx,
      userId,
      await tx
        .select(taskColumns)
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            between(tasks.date, from, to),
            isNull(tasks.deletedAt),
          ),
        )
        .orderBy(...taskOrder),
      from,
      to,
    ),
  );
}

async function listsAndTheirTasks(userId: string, from: string, to: string) {
  return snapshot(async (tx) => {
    const [userLists, rows] = await Promise.all([
      tx
        .select(listColumns)
        .from(lists)
        .where(eq(lists.userId, userId))
        .orderBy(...listOrder),
      tx
        .select(taskColumns)
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            or(between(tasks.date, from, to), isNotNull(tasks.listId)),
            isNull(tasks.deletedAt),
          ),
        )
        .orderBy(...taskOrder),
    ]);
    return {
      lists: userLists,
      tasks: await withOccurrences(tx, userId, rows, from, to),
    };
  });
}

type TaskPlacement = z.output<typeof placement>;

const inPlace = (userId: string, place: TaskPlacement) =>
  and(
    eq(tasks.userId, userId),
    "date" in place
      ? eq(tasks.date, place.date)
      : eq(tasks.listId, place.listId),
  );

const endOf = (userId: string, place: TaskPlacement) =>
  sql`(select coalesce(max(${tasks.position}), -1) + 1 from ${tasks} where ${inPlace(userId, place)})`;

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
  return toTask({ ...task, checklist: [] }, new Map());
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

async function insertOccurrences(
  tx: Transaction,
  userId: string,
  series: SeriesRow,
  dates: string[],
) {
  if (!dates.length) return;
  const rows = dates.map((date) => ({
    id: occurrenceIdOf(series.id, date),
    userId,
    title: series.title,
    notes: series.notes,
    color: series.color,
    date,
    seriesId: series.id,
    occurrence: date,
    position: endOf(userId, { date }),
  }));
  await tx.insert(tasks).values(rows);
  if (series.checklist.length)
    await tx.insert(checklistItems).values(
      rows.flatMap((row) =>
        series.checklist.map((text, position) => ({
          id: crypto.randomUUID(),
          taskId: row.id,
          text,
          position,
        })),
      ),
    );
}

async function materialize(
  tx: Transaction,
  userId: string,
  id: string,
): Promise<string | null> {
  const ref = occurrenceId.exec(id);
  if (!ref) return id;
  const [, seriesId, date] = ref;
  const [series] = await tx
    .select()
    .from(taskSeries)
    .where(and(eq(taskSeries.userId, userId), eq(taskSeries.id, seriesId)))
    .for("update");
  if (!series) return null;
  const rows = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      or(
        owned(userId, id),
        and(eq(tasks.seriesId, seriesId), eq(tasks.occurrence, date)),
      ),
    );
  if (rows.length) return rows.some((row) => row.id === id) ? id : null;
  if (!occurrences(seriesOf(series), date, date).length) return null;
  await insertOccurrences(tx, userId, series, [date]);
  return id;
}

async function weekStartOf(tx: Transaction, userId: string) {
  const [user] = await tx
    .select({ weekStartsOn: users.weekStartsOn })
    .from(users)
    .where(eq(users.id, userId));
  return user.weekStartsOn;
}

async function templateOf(
  tx: Transaction,
  task: Omit<TaskRecord, "checklist">,
) {
  const items = await tx
    .select({ text: checklistItems.text })
    .from(checklistItems)
    .where(eq(checklistItems.taskId, task.id))
    .orderBy(asc(checklistItems.position));
  return {
    title: task.title,
    notes: task.notes,
    color: task.color,
    checklist: items.map((item) => item.text),
  };
}

const endBefore = (tx: Transaction, series: SeriesRow, at: string) =>
  tx
    .update(taskSeries)
    .set({ endsOn: addDays(at, -1) })
    .where(
      and(
        eq(taskSeries.id, series.id),
        or(isNull(taskSeries.endsOn), sql`${taskSeries.endsOn} >= ${at}`),
      ),
    );

const fromOccurrence = (seriesId: string, at: string, inclusive: boolean) =>
  and(
    eq(tasks.seriesId, seriesId),
    inclusive
      ? sql`${tasks.occurrence} >= ${at}`
      : sql`${tasks.occurrence} > ${at}`,
  );

async function release(
  tx: Transaction,
  seriesId: string,
  after: string,
  keepMoved: boolean,
) {
  const rows = fromOccurrence(seriesId, after, false);
  const kept = keepMoved
    ? sql`(${tasks.deletedAt} is null and (${tasks.completedAt} is not null or ${tasks.date} is distinct from ${tasks.occurrence}))`
    : sql`(${tasks.deletedAt} is null and ${tasks.completedAt} is not null)`;
  await tx.delete(tasks).where(and(rows, not(kept)));
  await tx.update(tasks).set({ seriesId: null, occurrence: null }).where(rows);
}

async function startSeries(
  tx: Transaction,
  userId: string,
  task: Omit<TaskRecord, "checklist">,
  repeat: Repeat,
) {
  if (task.date === null)
    throw new PlannerInputError("Only a dated task repeats");
  const id = crypto.randomUUID();
  await tx.insert(taskSeries).values({
    id,
    userId,
    ...(await templateOf(tx, task)),
    ...ruleColumns(repeat),
    weekStartsOn: await weekStartOf(tx, userId),
    anchor: task.date,
    startsOn: task.date,
  });
  await tx
    .update(tasks)
    .set({ seriesId: id, occurrence: task.date })
    .where(owned(userId, task.id));
}

type SeriesEdits = Partial<Pick<TaskRecord, SeriesField>>;

type SeriesColumns = Exclude<SeriesField, "checklist">;

async function replaceChecklists(
  tx: Transaction,
  taskIds: string[],
  checklist: readonly { text: string }[],
) {
  if (!taskIds.length) return;
  // why: an item whose text stayed keeps its mark, and the rest come undone
  const marks = new Map<string, Map<string, boolean[]>>();
  const items = await tx
    .select({
      taskId: checklistItems.taskId,
      text: checklistItems.text,
      completed: checklistItems.completed,
    })
    .from(checklistItems)
    .where(inArray(checklistItems.taskId, taskIds));
  for (const { taskId, text, completed } of items) {
    const byText = marks.get(taskId) ?? new Map<string, boolean[]>();
    const queue = byText.get(text);
    if (queue) queue.push(completed);
    else byText.set(text, [completed]);
    marks.set(taskId, byText);
  }
  await tx
    .delete(checklistItems)
    .where(inArray(checklistItems.taskId, taskIds));
  const rows = taskIds.flatMap((taskId) =>
    checklist.map((item, position) => ({
      id: crypto.randomUUID(),
      taskId,
      text: item.text,
      completed: marks.get(taskId)?.get(item.text)?.shift() ?? false,
      position,
    })),
  );
  if (rows.length) await tx.insert(checklistItems).values(rows);
}

async function splitSeries(
  tx: Transaction,
  userId: string,
  task: Omit<TaskRecord, "checklist"> & {
    seriesId: string;
    occurrence: string;
  },
  repeat: Repeat | null | undefined,
  fields: SeriesEdits,
) {
  const at = task.occurrence;
  const [old] = await tx
    .select()
    .from(taskSeries)
    .where(eq(taskSeries.id, task.seriesId))
    .for("update");
  await endBefore(tx, old, at);
  if (repeat !== undefined) {
    await release(tx, old.id, at, true);
    await tx
      .update(tasks)
      .set({ seriesId: null, occurrence: null })
      .where(owned(userId, task.id));
    if (repeat) await startSeries(tx, userId, task, repeat);
    return;
  }
  const id = crypto.randomUUID();
  await tx.insert(taskSeries).values({
    id,
    userId,
    ...(await templateOf(tx, task)),
    ...ruleColumns(repeatOf(old)),
    weekStartsOn: old.weekStartsOn,
    anchor: old.anchor,
    startsOn: at > old.startsOn ? at : old.startsOn,
  });
  await tx
    .update(tasks)
    .set({ seriesId: id })
    .where(fromOccurrence(old.id, at, true));
  const following = fromOccurrence(id, at, false);
  // why: every column is spelled out here, so a new series field fails to compile until it is spread too
  const columns: { [Field in SeriesColumns]: TaskRecord[Field] | undefined } = {
    title: fields.title,
    notes: fields.notes,
    color: fields.color,
  };
  if (Object.values(columns).some((value) => value !== undefined))
    await tx.update(tasks).set(columns).where(following);
  if (fields.checklist !== undefined)
    await replaceChecklists(
      tx,
      (await tx.select({ id: tasks.id }).from(tasks).where(following)).map(
        (row) => row.id,
      ),
      fields.checklist,
    );
}

export async function updateTask(
  userId: string,
  id: string,
  input: TaskEdits,
  inScope: Scope = "this",
): Promise<Task | null> {
  const { completed, checklist, placement, repeat, ...fields } =
    edits.parse(input);
  const following = scope.parse(inScope) === "following";
  return db.transaction(async (tx) => {
    const target = await materialize(tx, userId, taskId.parse(id));
    if (!target) return null;
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
      .where(and(owned(userId, target), isNull(tasks.deletedAt)))
      .returning(taskColumns);
    if (!task) return null;
    if (placement?.index !== undefined) {
      const order = (
        await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(inPlace(userId, placement))
          .orderBy(asc(tasks.position), asc(tasks.createdAt), asc(tasks.id))
          .for("update")
      )
        .map((row) => row.id)
        .filter((id) => id !== task.id);
      order.splice(placement.index, 0, task.id);
      for (const [position, id] of order.entries())
        await tx
          .update(tasks)
          .set({ position })
          .where(and(eq(tasks.userId, userId), eq(tasks.id, id)));
    }
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
    const { seriesId, occurrence } = task;
    if (seriesId !== null && occurrence !== null) {
      if (following || repeat !== undefined)
        await splitSeries(
          tx,
          userId,
          { ...task, seriesId, occurrence },
          repeat,
          { ...fields, checklist },
        );
    } else if (repeat) await startSeries(tx, userId, task, repeat);
    const [read] = await withChecklists(
      tx,
      await tx.select(taskColumns).from(tasks).where(owned(userId, target)),
    );
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

export async function deleteTask(
  userId: string,
  id: string,
  inScope: Scope = "this",
): Promise<boolean> {
  const following = scope.parse(inScope) === "following";
  return db.transaction(async (tx) => {
    const target = await materialize(tx, userId, taskId.parse(id));
    if (!target) return false;
    const [task] = await tx
      .select({ seriesId: tasks.seriesId, occurrence: tasks.occurrence })
      .from(tasks)
      .where(and(owned(userId, target), isNull(tasks.deletedAt)))
      .for("update");
    if (!task) return false;
    if (task.seriesId === null)
      await tx.delete(tasks).where(owned(userId, target));
    else if (!following)
      // why: the row stays as a mark, so the series does not bring the occurrence back
      await tx
        .update(tasks)
        .set({ deletedAt: sql`now()` })
        .where(owned(userId, target));
    else {
      const [series] = await tx
        .select()
        .from(taskSeries)
        .where(eq(taskSeries.id, task.seriesId))
        .for("update");
      await endBefore(tx, series, task.occurrence!);
      await tx.delete(tasks).where(owned(userId, target));
      await release(tx, series.id, task.occurrence!, false);
    }
    return true;
  });
}

export async function updateSettings(
  userId: string,
  input: z.input<typeof settings>,
): Promise<void> {
  await db.update(users).set(settings.parse(input)).where(eq(users.id, userId));
}

async function rollOverUnfinishedTasks(userId: string, today: string) {
  const yesterday = addDays(today, -1);
  await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(taskSeries)
      .where(
        and(
          eq(taskSeries.userId, userId),
          sql`${taskSeries.startsOn} < ${today}`,
          or(
            isNull(taskSeries.endsOn),
            sql`${taskSeries.endsOn} >= ${taskSeries.startsOn}`,
          ),
        ),
      )
      .for("update");
    for (const series of due) {
      const taken = new Set(
        (
          await tx
            .select({ occurrence: tasks.occurrence })
            .from(tasks)
            .where(
              and(
                eq(tasks.seriesId, series.id),
                between(tasks.occurrence, series.startsOn, yesterday),
              ),
            )
        ).map((row) => row.occurrence),
      );
      await insertOccurrences(
        tx,
        userId,
        series,
        occurrences(seriesOf(series), series.startsOn, yesterday).filter(
          (date) => !taken.has(date),
        ),
      );
      await tx
        .update(taskSeries)
        .set({ startsOn: today })
        .where(eq(taskSeries.id, series.id));
    }
    await tx.execute(sql`
      with moving as (
        select ${tasks.id} as id,
          row_number() over (order by ${tasks.date}, ${tasks.position}, ${tasks.id}) as n
        from ${tasks}
        where ${tasks.userId} = ${userId}
          and ${tasks.date} < ${today}
          and ${tasks.completedAt} is null
          and ${tasks.deletedAt} is null
      )
      update ${tasks}
      set date = ${today},
        position = moving.n + (
          select coalesce(max(position), -1) from ${tasks}
          where user_id = ${userId} and date = ${today}
        )
      from moving
      where ${tasks.id} = moving.id`);
  });
}

export class PlannerNotFoundError extends Error {}
export class PlannerInputError extends Error {}

async function preparePlannerRead(
  userId: string,
  now: Date,
): Promise<{
  timeZone: string | null;
  weekStartsOn: WeekStart;
  today: string;
}> {
  const [user] = await db
    .select({ timeZone: users.timeZone, weekStartsOn: users.weekStartsOn })
    .from(users)
    .where(eq(users.id, userId));
  // why: before the browser reports a zone "today" is only a guess, so nothing is moved onto it
  const today = todayIn(user.timeZone ?? "UTC", now);
  if (user.timeZone) await rollOverUnfinishedTasks(userId, today);
  return { timeZone: user.timeZone, weekStartsOn: user.weekStartsOn, today };
}

async function listTasksIn(userId: string, id: string): Promise<Task[]> {
  return snapshot(async (tx) => {
    const [list] = await tx
      .select({ id: lists.id })
      .from(lists)
      .where(ownedList(userId, id));
    if (!list) throw new PlannerNotFoundError("List not found");
    return withChecklists(
      tx,
      await tx
        .select(taskColumns)
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            eq(tasks.listId, id),
            isNull(tasks.deletedAt),
          ),
        )
        .orderBy(...taskOrder),
    );
  });
}

export async function queryTasks(
  userId: string,
  input: z.input<typeof taskQuery>,
  now: Date,
): Promise<Task[]> {
  const query = taskQuery.parse(input);
  await preparePlannerRead(userId, now);
  const found =
    "listId" in query
      ? await listTasksIn(userId, query.listId)
      : await listTasks(userId, { from: query.from, to: query.to });
  const text = query.q?.toLowerCase();
  return found.filter((task) => {
    if (
      query.completed !== undefined &&
      task.completed !== (query.completed === "true")
    )
      return false;
    return (
      text === undefined ||
      task.title.toLowerCase().includes(text) ||
      task.notes.toLowerCase().includes(text)
    );
  });
}

export async function getTask(
  userId: string,
  id: string,
  now: Date,
): Promise<Task | null> {
  const ref = taskId.parse(id);
  await preparePlannerRead(userId, now);
  return snapshot(async (tx) => {
    const [stored] = await tx
      .select(taskColumns)
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.id, ref),
          isNull(tasks.deletedAt),
        ),
      );
    if (stored) return (await withChecklists(tx, [stored]))[0];
    const occurrence = occurrenceId.exec(ref);
    if (!occurrence) return null;
    const [, seriesId, date] = occurrence;
    const [series] = await tx
      .select()
      .from(taskSeries)
      .where(and(eq(taskSeries.userId, userId), eq(taskSeries.id, seriesId)));
    if (!series) return null;
    const pair = and(eq(tasks.seriesId, seriesId), eq(tasks.occurrence, date));
    const [taken] = await tx
      .select(taskColumns)
      .from(tasks)
      .where(and(pair, isNull(tasks.deletedAt)));
    if (taken) return (await withChecklists(tx, [taken]))[0];
    // why: a tombstone keeps the series from bringing the occurrence back
    const [gone] = await tx.select({ id: tasks.id }).from(tasks).where(pair);
    if (gone) return null;
    if (!validCalendarDate(date)) return null;
    if (!occurrences(seriesOf(series), date, date).length) return null;
    return virtualTask(series, date);
  });
}

export async function listLists(userId: string): Promise<TaskList[]> {
  return db
    .select(listColumns)
    .from(lists)
    .where(eq(lists.userId, userId))
    .orderBy(...listOrder);
}

async function searchTarget(userId: string, id: string) {
  const [stored] = await db
    .select({ id: tasks.id, date: tasks.date })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        or(eq(tasks.id, id), eq(tasks.seriesId, id)),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(...taskOrder)
    .limit(1);
  if (stored) return stored;
  const [series] = await db
    .select()
    .from(taskSeries)
    .where(and(eq(taskSeries.userId, userId), eq(taskSeries.id, id)));
  if (!series) return;
  const taken = new Set(
    (
      await db
        .select({ occurrence: tasks.occurrence })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.seriesId, id)))
    ).map((task) => task.occurrence),
  );
  const days =
    series.interval * { day: 1, week: 7, month: 31, year: 366 }[series.every];
  for (let from = series.startsOn; ;) {
    const to = addDays(from, days);
    const date = occurrences(seriesOf(series), from, to).find(
      (date) => !taken.has(date),
    );
    if (date) return { id: occurrenceIdOf(series.id, date), date };
    if (series.endsOn !== null && to >= series.endsOn) return;
    from = addDays(to, 1);
  }
}

export async function readWeek(
  userId: string,
  input: z.input<typeof weekQuery>,
  now: Date,
): Promise<WeekView> {
  const { week, focus } = weekQuery.parse(input);
  const { timeZone, weekStartsOn, today } = await preparePlannerRead(
    userId,
    now,
  );
  const target = focus ? await searchTarget(userId, focus) : undefined;
  const dates = weekOf(target?.date ?? week ?? today, weekStartsOn);
  return {
    timeZone,
    weekStartsOn,
    today,
    dates,
    focusId: target?.id,
    ...(await listsAndTheirTasks(userId, dates[0], dates[6])),
  };
}
