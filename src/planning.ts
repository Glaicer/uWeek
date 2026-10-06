import type { Task } from "./model";

export function isOverdue(task: Task, today: string): boolean {
  return (
    !task.completed &&
    task.placement.date !== undefined &&
    task.placement.date < today
  );
}

export function orderByPlacement(
  a: Task,
  b: Task,
  listOrder: ReadonlyMap<string, number>,
): number {
  const first = a.placement.date;
  const second = b.placement.date;
  if (first !== undefined && second !== undefined)
    return (
      first.localeCompare(second) ||
      a.order - b.order ||
      a.id.localeCompare(b.id)
    );
  if (first !== undefined) return -1;
  if (second !== undefined) return 1;
  return (
    listOrder.get(a.placement.listId!)! - listOrder.get(b.placement.listId!)! ||
    a.order - b.order ||
    a.id.localeCompare(b.id)
  );
}

export interface PageSlice<T> {
  rows: T[];
  pages: number;
  page: number;
}

export function paginate<T>(
  items: T[],
  page: number,
  size: number,
): PageSlice<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(page, pages - 1);
  return {
    rows: items.slice(safePage * size, safePage * size + size),
    pages,
    page: safePage,
  };
}

export function inWeek(task: Task, first: string, last: string): boolean {
  const date = task.placement.date;
  return date !== undefined && date >= first && date <= last;
}

export function mergeTasks(
  current: Task[],
  changed: Task[],
  accepts: (task: Task) => boolean,
): Task[] {
  const changedIds = new Set(changed.map((task) => task.id));
  return [
    ...current.filter((task) => !changedIds.has(task.id)),
    ...changed.filter(accepts),
  ];
}

export function tasksForDate(tasks: Task[], date: string): Task[] {
  return tasks.filter((task) => task.placement.date === date);
}
