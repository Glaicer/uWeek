import { describe, expect, test } from "vitest";
import { monthEndChoice, occurrences, type Series } from "./recurrence";

const series = (
  repeat: Series["repeat"],
  anchor: string,
  rest: Partial<Omit<Series, "repeat" | "anchor">> = {},
): Series => ({ repeat, anchor, startsOn: anchor, weekStartsOn: 1, ...rest });

describe("occurrences", () => {
  test("a daily series repeats every N days from its first day", () => {
    const daily = series(
      { every: "day", interval: 1, until: null },
      "2026-11-10",
    );
    expect(occurrences(daily, "2026-11-08", "2026-11-13")).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
    const third = series(
      { every: "day", interval: 3, until: null },
      "2026-11-10",
    );
    expect(occurrences(third, "2026-11-12", "2026-11-20")).toEqual([
      "2026-11-13",
      "2026-11-16",
      "2026-11-19",
    ]);
  });

  test("the end date is the last day a series can fall on", () => {
    const daily = series(
      { every: "day", interval: 1, until: "2026-11-12" },
      "2026-11-10",
    );
    expect(occurrences(daily, "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
  });

  test("a series started later keeps the rhythm of its anchor", () => {
    const everyOther = series(
      { every: "day", interval: 2, until: null },
      "2026-11-10",
      { startsOn: "2026-11-15" },
    );
    expect(occurrences(everyOther, "2026-11-10", "2026-11-19")).toEqual([
      "2026-11-16",
      "2026-11-18",
    ]);
  });

  test("a weekly series falls on the chosen weekdays of every Nth week", () => {
    const weekly = series(
      { every: "week", interval: 2, weekdays: [1, 3], until: null },
      "2026-11-11",
    );
    expect(occurrences(weekly, "2026-11-09", "2026-12-06")).toEqual([
      "2026-11-11",
      "2026-11-23",
      "2026-11-25",
    ]);
  });

  test("every other week counts weeks the way the user's week starts", () => {
    const repeat: Series["repeat"] = {
      every: "week",
      interval: 2,
      weekdays: [0, 1],
      until: null,
    };
    expect(
      occurrences(
        series(repeat, "2026-11-15", { weekStartsOn: 0 }),
        "2026-11-15",
        "2026-11-30",
      ),
    ).toEqual(["2026-11-15", "2026-11-16", "2026-11-29", "2026-11-30"]);
    expect(
      occurrences(series(repeat, "2026-11-15"), "2026-11-15", "2026-11-30"),
    ).toEqual(["2026-11-15", "2026-11-23", "2026-11-29"]);
  });

  test("a monthly series repeats on its day of the month", () => {
    const monthly = series(
      { every: "month", interval: 1, monthEnd: "clamp", until: null },
      "2026-11-16",
    );
    expect(occurrences(monthly, "2026-11-01", "2027-02-28")).toEqual([
      "2026-11-16",
      "2026-12-16",
      "2027-01-16",
      "2027-02-16",
    ]);
    const quarterly = series(
      { every: "month", interval: 3, monthEnd: "clamp", until: null },
      "2026-11-16",
    );
    expect(occurrences(quarterly, "2026-12-01", "2027-06-30")).toEqual([
      "2027-02-16",
      "2027-05-16",
    ]);
  });

  test("on the 29th–31st a monthly series falls on the last day of shorter months by default", () => {
    const on31 = series(
      { every: "month", interval: 1, monthEnd: "clamp", until: null },
      "2027-01-31",
    );
    expect(occurrences(on31, "2027-01-01", "2027-05-31")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
    const on29 = series(
      { every: "month", interval: 1, monthEnd: "clamp", until: null },
      "2027-12-29",
    );
    expect(occurrences(on29, "2028-01-01", "2028-03-31")).toEqual([
      "2028-01-29",
      "2028-02-29",
      "2028-03-29",
    ]);
  });

  test("a monthly series on the 31st can move to the 1st of the next month instead", () => {
    const overflow = series(
      { every: "month", interval: 1, monthEnd: "overflow", until: null },
      "2027-01-31",
    );
    expect(occurrences(overflow, "2027-01-01", "2027-05-31")).toEqual([
      "2027-01-31",
      "2027-03-01",
      "2027-03-31",
      "2027-05-01",
      "2027-05-31",
    ]);
  });

  test("a monthly series on the last day can follow the last day of every month", () => {
    const last = series(
      { every: "month", interval: 1, monthEnd: "last", until: null },
      "2026-11-30",
    );
    expect(occurrences(last, "2026-11-01", "2027-03-31")).toEqual([
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
    const on30 = series(
      { every: "month", interval: 1, monthEnd: "clamp", until: null },
      "2026-11-30",
    );
    expect(occurrences(on30, "2026-11-01", "2027-03-31")).toEqual([
      "2026-11-30",
      "2026-12-30",
      "2027-01-30",
      "2027-02-28",
      "2027-03-30",
    ]);
  });

  test("a yearly series on 29 February falls on 28 February outside leap years", () => {
    const leap = series(
      { every: "year", interval: 1, until: null },
      "2028-02-29",
    );
    expect(occurrences(leap, "2028-01-01", "2032-12-31")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]);
    const everyOther = series(
      { every: "year", interval: 2, until: null },
      "2026-11-16",
    );
    expect(occurrences(everyOther, "2026-01-01", "2031-12-31")).toEqual([
      "2026-11-16",
      "2028-11-16",
      "2030-11-16",
    ]);
  });

  test("nothing falls before the series starts or in an empty range", () => {
    const daily = series(
      { every: "day", interval: 1, until: null },
      "2026-11-10",
    );
    expect(occurrences(daily, "2026-11-01", "2026-11-09")).toEqual([]);
    expect(occurrences(daily, "2026-11-12", "2026-11-11")).toEqual([]);
  });
});

describe("monthEndChoice", () => {
  test("only the 31st and the last day of a shorter month ask what to do in short months", () => {
    expect(monthEndChoice("2026-12-31")).toBe("31st");
    expect(monthEndChoice("2026-11-30")).toBe("last day");
    expect(monthEndChoice("2027-02-28")).toBe("last day");
    expect(monthEndChoice("2028-02-29")).toBe("last day");
    expect(monthEndChoice("2026-12-30")).toBeNull();
    expect(monthEndChoice("2028-02-28")).toBeNull();
    expect(monthEndChoice("2026-11-16")).toBeNull();
  });
});
