import { expect, test } from "vitest";
import { z } from "zod";
import { repeat, taskQuery, taskResult } from "./planner-schemas";
import type { Task } from "./planner";

test("planner schemas preserve weekly normalization and serialize planner results", () => {
  expect(
    repeat.parse({
      every: "week",
      interval: 2,
      until: null,
      weekdays: [5, 1, 5],
    }),
  ).toEqual({
    every: "week",
    interval: 2,
    until: null,
    weekdays: [1, 5],
  });

  const seriesId = crypto.randomUUID();
  const dated: Task = {
    id: crypto.randomUUID(),
    title: "Buy milk",
    completed: false,
    notes: "",
    color: null,
    checklist: [
      { id: crypto.randomUUID(), text: "Take the bag", completed: true },
    ],
    date: "2026-11-09",
  };
  const listed: Task = {
    id: crypto.randomUUID(),
    title: "Someday",
    completed: true,
    notes: "Later",
    color: "blue",
    checklist: [],
    listId: crypto.randomUUID(),
  };
  const recurring: Task = {
    id: `${seriesId}_2026-11-10`,
    title: "Water plants",
    completed: false,
    notes: "",
    color: "green",
    checklist: [],
    recurrence: {
      seriesId,
      occurrence: "2026-11-10",
      repeat: { every: "week", interval: 1, until: null, weekdays: [1, 3] },
    },
    date: "2026-11-10",
  };

  for (const task of [dated, listed, recurring])
    expect(taskResult.parse(task)).toEqual(task);

  expect(
    taskResult.safeParse({ ...dated, listId: crypto.randomUUID() }).success,
  ).toBe(false);

  const json = z.toJSONSchema(repeat);
  const weekly = json.oneOf!.find((branch) => {
    const every = branch.properties?.every;
    return typeof every === "object" && every.const === "week";
  })!;
  const weekdays = weekly.properties!.weekdays as z.core.JSONSchema.JSONSchema;
  const items = weekdays.items as z.core.JSONSchema.JSONSchema;
  expect(weekdays.minItems).toBe(1);
  expect(weekdays.maxItems).toBe(7);
  expect(items.enum).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

test("task queries require one bounded placement filter", () => {
  const listId = crypto.randomUUID();

  expect(taskQuery.parse({ from: "2026-11-09", to: "2026-11-09" })).toEqual({
    from: "2026-11-09",
    to: "2026-11-09",
  });
  expect(
    taskQuery.safeParse({ from: "2025-01-01", to: "2026-01-01" }).success,
  ).toBe(true);
  expect(
    taskQuery.safeParse({ from: "2025-01-01", to: "2026-01-02" }).success,
  ).toBe(false);
  expect(
    taskQuery.safeParse({ from: "2026-11-10", to: "2026-11-09" }).success,
  ).toBe(false);
  expect(taskQuery.safeParse({ from: "2026-11-09" }).success).toBe(false);
  expect(taskQuery.safeParse({ to: "2026-11-09" }).success).toBe(false);
  expect(
    taskQuery.safeParse({
      from: "2026-11-09",
      to: "2026-11-10",
      listId,
    }).success,
  ).toBe(false);
  expect(taskQuery.safeParse({}).success).toBe(false);
  expect(
    taskQuery.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success,
  ).toBe(false);
  expect(taskQuery.safeParse({ listId, completed: "yes" }).success).toBe(false);
  expect(taskQuery.safeParse({ listId, extra: "x" }).success).toBe(false);
  expect(taskQuery.safeParse({ listId, q: "   " }).success).toBe(false);

  expect(taskQuery.parse({ listId, completed: "false" })).toEqual({
    listId,
    completed: "false",
  });
  expect(taskQuery.parse({ listId, q: "  milk  " }).q).toBe("milk");
});
