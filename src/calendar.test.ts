import { describe, expect, test } from "vitest";
import { todayIn, weekNumber, weekOf } from "./calendar";

describe("todayIn", () => {
  const instant = new Date("2026-11-14T22:30:00Z");

  test("the same instant is a different day in different time zones", () => {
    expect(todayIn("UTC", instant)).toBe("2026-11-14");
    expect(todayIn("Europe/Moscow", instant)).toBe("2026-11-15");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-11-14");
    expect(todayIn("Asia/Bangkok", instant)).toBe("2026-11-15");
  });

  test("crosses the new year ahead of UTC", () => {
    expect(todayIn("Pacific/Auckland", new Date("2026-12-31T11:00:00Z"))).toBe(
      "2027-01-01",
    );
  });

  test("keeps the calendar day across a daylight-saving change", () => {
    expect(todayIn("America/New_York", new Date("2026-11-01T05:30:00Z"))).toBe(
      "2026-11-01",
    );
    expect(todayIn("America/New_York", new Date("2026-11-02T04:30:00Z"))).toBe(
      "2026-11-01",
    );
  });
});

describe("weekOf", () => {
  test("a Monday week runs Monday to Sunday", () => {
    expect(weekOf("2026-11-14", 1)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });

  test("a Sunday week runs Sunday to Saturday", () => {
    expect(weekOf("2026-11-15", 0)).toEqual([
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ]);
  });

  test("crosses a month boundary", () => {
    expect(weekOf("2026-12-01", 1)).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
      "2026-12-06",
    ]);
  });

  test("crosses a year boundary", () => {
    expect(weekOf("2027-01-01", 0)).toEqual([
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  test("includes a leap day", () => {
    expect(weekOf("2028-03-01", 1)).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
      "2028-03-02",
      "2028-03-03",
      "2028-03-04",
      "2028-03-05",
    ]);
  });

  test("is not shifted by a daylight-saving change inside the week", () => {
    expect(weekOf("2026-03-29", 1)[0]).toBe("2026-03-23");
    expect(weekOf("2026-03-30", 1)).toContain("2026-04-05");
  });
});

describe("weekNumber", () => {
  test("is the ISO week of the week's Thursday", () => {
    expect(weekNumber(weekOf("2026-11-14", 1))).toBe(46);
    expect(weekNumber(weekOf("2027-01-01", 1))).toBe(53);
    expect(weekNumber(weekOf("2027-01-04", 1))).toBe(1);
  });

  test("a Sunday week is numbered by its own Thursday", () => {
    expect(weekNumber(weekOf("2026-11-14", 0))).toBe(46);
    expect(weekNumber(weekOf("2026-11-15", 0))).toBe(47);
    expect(weekNumber(weekOf("2026-12-27", 0))).toBe(53);
  });
});
