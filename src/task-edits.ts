import { localDate } from "./calendar";
import type { Placement } from "./model";
import type { ChecklistItem, Task, TaskEdits } from "./planner";
import {
  monthEndChoice,
  type MonthEnd,
  type Repeat,
  type Weekday,
} from "./recurrence";

// why: the same fields decide the scope question in the client and what `splitSeries` spreads over the series
export const seriesFields = ["title", "notes", "color", "checklist"] as const;

export type SeriesField = (typeof seriesFields)[number];

export type TaskDetails = Pick<
  Task,
  "title" | "notes" | "color" | "checklist"
> & { placement: Placement; repeat: Repeat | null };

export interface TaskChanges {
  edits: TaskEdits;
  seriesChanged: boolean;
}

export const placeOf = (placement: Placement) =>
  placement.date ?? placement.listId;

export function placed(tasks: Task[], moved: Task, index: number): Task[] {
  const rest = tasks.filter((task) => task.id !== moved.id);
  const place = rest.filter((task) => placeOf(task) === placeOf(moved));
  const at =
    index < place.length
      ? rest.indexOf(place[index])
      : place.length
        ? rest.indexOf(place[place.length - 1]) + 1
        : rest.length;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

function ordinal(day: number): string {
  const tens = day % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th");
  return `${day}${suffix}`;
}

export function monthEndOptions(
  date: string,
): { value: MonthEnd; label: string }[] {
  const choice = monthEndChoice(date);
  if (choice === "31st")
    return [
      { value: "last", label: "Last day of shorter months" },
      { value: "overflow", label: "1st of the next month" },
    ];
  if (choice === "last day")
    return [
      { value: "clamp", label: `The ${ordinal(Number(date.slice(8)))}` },
      { value: "last", label: "The last day of the month" },
    ];
  return [];
}

export function repeatOn(repeat: Repeat, date: string): Repeat {
  if (repeat.every !== "month") return repeat;
  const options = monthEndOptions(date).map((option) => option.value);
  if (options.includes(repeat.monthEnd)) return repeat;
  return { ...repeat, monthEnd: options[0] ?? "clamp" };
}

export function startRepeat(
  every: Repeat["every"],
  date: string,
  from: Repeat | null,
): Repeat {
  const base = { interval: from?.interval ?? 1, until: from?.until ?? null };
  if (every === "week")
    return { ...base, every, weekdays: [localDate(date).getDay() as Weekday] };
  if (every === "month")
    return repeatOn({ ...base, every, monthEnd: "clamp" }, date);
  return { ...base, every };
}

export function sameRepeat(a: Repeat | null, b: Repeat | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.every === b.every &&
    a.interval === b.interval &&
    a.until === b.until &&
    (a.every !== "week" ||
      (b.every === "week" && a.weekdays.join() === b.weekdays.join())) &&
    (a.every !== "month" || (b.every === "month" && a.monthEnd === b.monthEnd))
  );
}

const textsOf = (checklist: readonly ChecklistItem[]) =>
  JSON.stringify(checklist.map((item) => item.text));

export function changesOf(
  task: Task,
  details: TaskDetails,
): TaskChanges | null {
  const edits: TaskEdits = {};
  const title = details.title.trim();
  if (title && title !== task.title) edits.title = title;
  if (details.notes !== task.notes) edits.notes = details.notes;
  if (details.color !== task.color) edits.color = details.color;
  const checklist = details.checklist
    .map((item) => ({ ...item, text: item.text.trim() }))
    .filter((item) => item.text);
  if (JSON.stringify(checklist) !== JSON.stringify(task.checklist))
    edits.checklist = checklist;
  // why: marks of checklist items belong to one occurrence, so only their texts and order reach the series
  const seriesChanged = seriesFields.some((field) =>
    field === "checklist"
      ? textsOf(checklist) !== textsOf(task.checklist)
      : edits[field] !== undefined,
  );
  if (placeOf(details.placement) !== placeOf(task))
    edits.placement = details.placement;
  const date = details.placement.date;
  if (
    date !== undefined &&
    details.repeat !== (task.recurrence?.repeat ?? null)
  ) {
    const repeat = details.repeat && repeatOn(details.repeat, date);
    if (!sameRepeat(repeat, task.recurrence?.repeat ?? null))
      edits.repeat = repeat;
  }
  if (!Object.keys(edits).length) return null;
  return { edits, seriesChanged };
}
