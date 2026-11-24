import { describe, expect, test } from "vitest";
import type { Task } from "./planner";
import type { Repeat } from "./recurrence";
import {
  changesOf,
  placed,
  repeatOn,
  sameRepeat,
  startRepeat,
  type TaskDetails,
} from "./task-edits";

type Fields = Partial<Omit<Task, "date" | "listId">>;

const base = (overrides: Fields) => ({
  id: "4b1b0af8-18c8-4f5d-8d0b-3e6bb4b0c9a1",
  title: "Run",
  completed: false,
  notes: "",
  color: null,
  checklist: [],
  ...overrides,
});

const onDay = (overrides: Fields = {}, date = "2026-11-10"): Task => ({
  ...base(overrides),
  date,
});

const inList = (overrides: Fields = {}, listId = "list-id"): Task => ({
  ...base(overrides),
  listId,
});

const details = (overrides: Partial<TaskDetails> = {}): TaskDetails => ({
  title: "Run",
  notes: "",
  color: null,
  checklist: [],
  placement: { date: "2026-11-10" },
  repeat: null,
  ...overrides,
});

const item = (text: string, completed = false) => ({
  id: crypto.randomUUID(),
  text,
  completed,
});

describe("placed", () => {
  const first = onDay({ id: "a", title: "First" });
  const second = onDay({ id: "b", title: "Second" });
  const third = onDay({ id: "c", title: "Third" });
  const other = onDay({ id: "d", title: "Other" }, "2026-11-11");

  test("a task moved to an index among its day's tasks lands before that row", () => {
    expect(placed([first, second, third, other], third, 0)).toEqual([
      third,
      first,
      second,
      other,
    ]);
    expect(placed([first, second, third, other], first, 1)).toEqual([
      second,
      first,
      third,
      other,
    ]);
  });

  test("an index past the last row puts the task at the end of its day, not of the week", () => {
    expect(placed([first, second, third, other], first, 5)).toEqual([
      second,
      third,
      first,
      other,
    ]);
  });

  test("a task arriving in an empty day keeps the week's order", () => {
    const empty = onDay({ id: "e", title: "Empty" }, "2026-11-12");
    expect(placed([first, other, empty], empty, 0)).toEqual([
      first,
      other,
      empty,
    ]);
  });
});

describe("changesOf", () => {
  test("nothing changed is no edits", () => {
    expect(changesOf(onDay(), details())).toBeNull();
  });

  test("a trimmed title, the notes, the color and the checklist are edits of a series field", () => {
    const tickets = item("Tickets");
    const passport = item("Passport", true);
    expect(
      changesOf(
        onDay(),
        details({
          title: "  Run 5k  ",
          notes: "Easy pace",
          color: "green",
          checklist: [tickets, passport],
        }),
      ),
    ).toEqual({
      edits: {
        title: "Run 5k",
        notes: "Easy pace",
        color: "green",
        checklist: [tickets, passport],
      },
      seriesChanged: true,
    });
  });

  test("a blank checklist item is dropped, not saved", () => {
    const tickets = item("Tickets");
    expect(
      changesOf(onDay(), details({ checklist: [item(" "), tickets] })),
    ).toEqual({
      edits: { checklist: [tickets] },
      seriesChanged: true,
    });
  });

  test("marks alone are saved without asking about the series", () => {
    const tickets = item("Tickets");
    const passport = item("Passport");
    const marked = [tickets, { ...passport, completed: true }];
    expect(
      changesOf(
        onDay({ checklist: [tickets, passport] }),
        details({ checklist: marked }),
      ),
    ).toEqual({ edits: { checklist: marked }, seriesChanged: false });
  });

  test("a moved task carries its placement and does not touch its repeat", () => {
    expect(
      changesOf(onDay(), details({ placement: { date: "2026-11-11" } })),
    ).toEqual({
      edits: { placement: { date: "2026-11-11" } },
      seriesChanged: false,
    });
    const daily = { every: "day", interval: 1, until: null } as const;
    expect(
      changesOf(
        inList(),
        details({ placement: { listId: "list-id" }, repeat: daily }),
      ),
    ).toBeNull();
  });

  test("a new monthly rule is shaped by the date it starts on", () => {
    const monthly = { every: "month", interval: 1, until: null } as const;
    expect(
      changesOf(
        onDay({}, "2026-12-31"),
        details({
          placement: { date: "2026-12-31" },
          repeat: { ...monthly, monthEnd: "clamp" },
        }),
      ),
    ).toEqual({
      edits: { repeat: { ...monthly, monthEnd: "last" } },
      seriesChanged: false,
    });
  });
});

describe("repeatOn", () => {
  const monthly = { every: "month", interval: 1, until: null } as const;

  test("a monthly rule on the 31st follows the shorter months it lands in", () => {
    expect(repeatOn({ ...monthly, monthEnd: "clamp" }, "2026-12-31")).toEqual({
      ...monthly,
      monthEnd: "last",
    });
    expect(repeatOn({ ...monthly, monthEnd: "last" }, "2026-12-31")).toEqual({
      ...monthly,
      monthEnd: "last",
    });
  });

  test("a monthly rule keeps a choice the date still allows", () => {
    expect(repeatOn({ ...monthly, monthEnd: "clamp" }, "2026-11-30")).toEqual({
      ...monthly,
      monthEnd: "clamp",
    });
    expect(repeatOn({ ...monthly, monthEnd: "last" }, "2026-11-30")).toEqual({
      ...monthly,
      monthEnd: "last",
    });
  });

  test("a month-end choice on a date that is not one falls back to the day itself", () => {
    expect(
      repeatOn({ ...monthly, monthEnd: "overflow" }, "2026-11-16"),
    ).toEqual({ ...monthly, monthEnd: "clamp" });
  });

  test("a rule that is not monthly is kept as it is", () => {
    const weekly: Repeat = {
      every: "week",
      interval: 2,
      until: null,
      weekdays: [1, 3],
    };
    expect(repeatOn(weekly, "2026-11-10")).toEqual(weekly);
  });
});

describe("startRepeat", () => {
  test("a weekly rule starts on the chosen date's weekday and keeps what it had", () => {
    expect(
      startRepeat("week", "2026-11-10", {
        every: "day",
        interval: 3,
        until: "2027-01-01",
      }),
    ).toEqual({
      every: "week",
      interval: 3,
      until: "2027-01-01",
      weekdays: [2],
    });
  });

  test("a monthly rule starts in the month-end shape of the chosen date", () => {
    expect(startRepeat("month", "2026-12-31", null)).toEqual({
      every: "month",
      interval: 1,
      until: null,
      monthEnd: "last",
    });
  });

  test("a daily rule needs no further choices", () => {
    expect(startRepeat("day", "2026-11-30", null)).toEqual({
      every: "day",
      interval: 1,
      until: null,
    });
  });
});

describe("sameRepeat", () => {
  const daily = { every: "day", interval: 1, until: null } as const;

  test("a null rule equals only a null rule", () => {
    expect(sameRepeat(null, null)).toBe(true);
    expect(sameRepeat(daily, null)).toBe(false);
  });

  test("the chosen weekdays and the month-end shape count", () => {
    expect(
      sameRepeat(
        { every: "week", interval: 1, until: null, weekdays: [1, 3] },
        { every: "week", interval: 1, until: null, weekdays: [1, 3] },
      ),
    ).toBe(true);
    expect(
      sameRepeat(
        { every: "week", interval: 1, until: null, weekdays: [1, 3] },
        { every: "week", interval: 1, until: null, weekdays: [1] },
      ),
    ).toBe(false);
    expect(
      sameRepeat(
        { every: "month", interval: 1, until: null, monthEnd: "last" },
        { every: "month", interval: 1, until: null, monthEnd: "clamp" },
      ),
    ).toBe(false);
    expect(
      sameRepeat(
        { every: "day", interval: 2, until: "2027-01-01" },
        { every: "day", interval: 2, until: "2027-01-02" },
      ),
    ).toBe(false);
  });
});
