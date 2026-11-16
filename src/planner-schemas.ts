import { z } from "zod";
import { validCalendarDate } from "./calendar";
import { taskColorValues } from "./model";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .meta({ format: "date" })
  .refine(validCalendarDate, "Invalid date");
export const title = z.string().trim().min(1).max(500);
export const occurrenceId = /^([0-9a-f-]{36})_(\d{4}-\d{2}-\d{2})$/;
export const taskId = z.union([z.uuid(), z.string().regex(occurrenceId)]);
export const scope = z.enum(["this", "following"]);
export const interval = z.int().min(1).max(999);
export const until = isoDate.nullable();
export const repeat = z.discriminatedUnion("every", [
  z.object({ every: z.literal("day"), interval, until }),
  z.object({
    every: z.literal("week"),
    interval,
    until,
    weekdays: z
      .array(z.literal([0, 1, 2, 3, 4, 5, 6]))
      .min(1)
      .max(7)
      .overwrite((days) => [...new Set(days)].sort()),
  }),
  z.object({
    every: z.literal("month"),
    interval,
    until,
    monthEnd: z.enum(["clamp", "last", "overflow"]),
  }),
  z.object({ every: z.literal("year"), interval, until }),
]);
export const range = z.object({ from: isoDate, to: isoDate });
export const index = z.int().min(0).optional();
export const placement = z.xor([
  z.object({ date: isoDate, index }),
  z.object({ listId: z.uuid(), index }),
]);
export const newTask = z.xor([
  z.object({ title, date: isoDate }),
  z.object({ title, listId: z.uuid() }),
]);
export const newList = z.object({ title });
export const listId = z.uuid();
export const listMove = z.object({ to: z.int().min(0) });
export const edits = z
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
    repeat: repeat.nullable().optional(),
  })
  .refine(
    (edits) => Object.values(edits).some((edit) => edit !== undefined),
    "Nothing to change",
  );

export type TaskEdits = z.input<typeof edits>;

export const timeZone = z.string().refine((zone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}, "Unknown time zone");
export const settings = z
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
export const weekQuery = z.object({
  week: isoDate.optional(),
  focus: taskId.optional(),
});
export const searchQuery = z.object({
  query: z.string().trim().min(1).max(500),
  cursor: z.int().min(0).default(0),
});

const checklistItem = z.strictObject({
  id: z.uuid(),
  text: title,
  completed: z.boolean(),
});

const taskFields = {
  id: taskId,
  title,
  completed: z.boolean(),
  notes: z.string(),
  color: z.enum(taskColorValues).nullable(),
  checklist: z.array(checklistItem).max(200),
  recurrence: z
    .object({
      seriesId: z.uuid(),
      occurrence: isoDate,
      repeat,
    })
    .optional(),
};

export const taskResult = z.xor([
  z.strictObject({ ...taskFields, date: isoDate }),
  z.strictObject({ ...taskFields, listId }),
]);

export const listResult = z.strictObject({ id: listId, title });

export const completionFields = {
  completed: z.enum(["true", "false"]).optional(),
  q: z.string().trim().min(1).max(500).optional(),
};

const dayDifference = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
  86_400_000;

export type TaskQuery = (
  | { from: string; to: string; listId?: never }
  | { listId: string; from?: never; to?: never }
) & { completed?: "true" | "false"; q?: string };

export const taskQuery = z.xor([
  z
    .strictObject({ from: isoDate, to: isoDate, ...completionFields })
    .refine(
      ({ from, to }) => from <= to && dayDifference(from, to) <= 365,
      "The range must be ordered and no longer than 366 days",
    ),
  z.strictObject({ listId, ...completionFields }),
]);

export const scopeQuery = z.strictObject({ scope: scope.default("this") });
