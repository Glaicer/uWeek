import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { WeekStart } from "../calendar";
import { taskColorValues, type CsvProvenance, type TaskColor } from "../model";
import type { MonthEnd, Repeat, Weekday } from "../recurrence";

const createdAt = () =>
  timestamp({ withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

export const users = pgTable(
  "users",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    timeZone: text(),
    weekStartsOn: smallint().$type<WeekStart>().default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("users_week_starts_on", sql`${table.weekStartsOn} in (0, 1)`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index().on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index().on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index().on(table.identifier)],
);

export const lists = pgTable(
  "lists",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    position: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique("lists_user_id_id_unique").on(table.userId, table.id)],
);

export const taskSeries = pgTable(
  "task_series",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    notes: text().default("").notNull(),
    color: text().$type<TaskColor>(),
    checklist: text()
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    every: text().$type<Repeat["every"]>().notNull(),
    interval: integer().notNull(),
    weekdays: smallint().array().$type<Weekday[]>(),
    monthEnd: text().$type<MonthEnd>(),
    weekStartsOn: smallint().$type<WeekStart>().notNull(),
    anchor: date({ mode: "string" }).notNull(),
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("task_series_user_id_id_unique").on(table.userId, table.id),
    check("task_series_interval", sql`${table.interval} >= 1`),
    check(
      "task_series_rule",
      sql`case ${table.every}
        when 'day' then ${table.weekdays} is null and ${table.monthEnd} is null
        when 'week' then cardinality(${table.weekdays}) > 0 and ${table.monthEnd} is null
        when 'month' then ${table.weekdays} is null and ${table.monthEnd} in ('clamp', 'last', 'overflow')
        when 'year' then ${table.weekdays} is null and ${table.monthEnd} is null
        else false end`,
    ),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    date: date({ mode: "string" }),
    listId: text(),
    position: integer().notNull(),
    notes: text().default("").notNull(),
    color: text().$type<TaskColor>(),
    completedAt: timestamp({ withTimezone: true }),
    seriesId: text(),
    occurrence: date({ mode: "string" }),
    deletedAt: timestamp({ withTimezone: true }),
    provenance: jsonb().$type<CsvProvenance>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index().on(table.userId, table.date),
    index().on(table.userId, table.listId),
    unique("tasks_series_id_occurrence_unique").on(
      table.seriesId,
      table.occurrence,
    ),
    foreignKey({
      columns: [table.userId, table.seriesId],
      foreignColumns: [taskSeries.userId, taskSeries.id],
    }).onDelete("cascade"),
    check(
      "tasks_series_occurrence",
      sql`(${table.seriesId} is null) = (${table.occurrence} is null)`,
    ),
    check(
      "tasks_deleted_occurrence",
      sql`${table.deletedAt} is null or ${table.seriesId} is not null`,
    ),
    // why: the user is part of the key, so a task can only sit in its owner's list
    foreignKey({
      columns: [table.userId, table.listId],
      foreignColumns: [lists.userId, lists.id],
    }).onDelete("cascade"),
    check(
      "tasks_date_xor_list",
      sql`(${table.date} is null) <> (${table.listId} is null)`,
    ),
    check(
      "tasks_color",
      sql`${table.color} in (${sql.raw(
        taskColorValues.map((color) => `'${color}'`).join(", "),
      )})`,
    ),
  ],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: text().primaryKey(),
    taskId: text()
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    text: text().notNull(),
    completed: boolean().default(false).notNull(),
    position: integer().notNull(),
  },
  (table) => [index().on(table.taskId, table.position)],
);

export const importHistory = pgTable(
  "import_history",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fingerprint: text().notNull(),
    importedAt: createdAt(),
    addedTasks: integer().notNull(),
    addedLists: integer().notNull(),
    emptyRecords: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.fingerprint] })],
);
