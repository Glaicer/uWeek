import { addDays, type WeekStart } from "./calendar";

export type MonthEnd = "clamp" | "last" | "overflow";
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Repeat = { interval: number; until: string | null } & (
  | { every: "day" }
  | { every: "week"; weekdays: Weekday[] }
  | { every: "month"; monthEnd: MonthEnd }
  | { every: "year" }
);

export interface Series {
  repeat: Repeat;
  anchor: string;
  startsOn: string;
  weekStartsOn: WeekStart;
}

const dayNumber = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const weekdayOf = (date: string) => ((dayNumber(date) % 7) + 11) % 7;
const daysIn = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();
const iso = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);

function onDay(year: number, month: number, day: number, monthEnd: MonthEnd) {
  const last = daysIn(year, month);
  if (monthEnd === "last") return iso(year, month, last);
  if (day <= last) return iso(year, month, day);
  return monthEnd === "overflow"
    ? iso(year, month + 1, 1)
    : iso(year, month, last);
}

export function occurrences(
  series: Series,
  from: string,
  to: string,
): string[] {
  const { repeat, anchor, weekStartsOn } = series;
  const first = from > series.startsOn ? from : series.startsOn;
  const last = repeat.until !== null && repeat.until < to ? repeat.until : to;
  if (first > last) return [];
  const dates: string[] = [];
  if (repeat.every === "month" || repeat.every === "year") {
    const [year, month, day] = anchor.split("-").map(Number);
    const step =
      repeat.every === "month" ? repeat.interval : repeat.interval * 12;
    const monthEnd = repeat.every === "month" ? repeat.monthEnd : "clamp";
    for (let k = 0; ; k += step) {
      const date = onDay(year, month + k, day, monthEnd);
      if (date > last) break;
      if (date >= first) dates.push(date);
    }
    return dates;
  }
  const weekStart = (date: string) =>
    dayNumber(date) - ((weekdayOf(date) - weekStartsOn + 7) % 7);
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (repeat.every === "day") {
      if ((dayNumber(date) - dayNumber(anchor)) % repeat.interval === 0)
        dates.push(date);
    } else if (
      repeat.weekdays.includes(weekdayOf(date) as Weekday) &&
      ((weekStart(date) - weekStart(anchor)) / 7) % repeat.interval === 0
    )
      dates.push(date);
  }
  return dates;
}

export function monthEndChoice(date: string): "31st" | "last day" | null {
  const [year, month, day] = date.split("-").map(Number);
  if (day === 31) return "31st";
  return day === daysIn(year, month) ? "last day" : null;
}
