import type { Placement } from "./model";

export function samePlacement(a: Placement, b: Placement): boolean {
  return a.date === b.date && a.listId === b.listId;
}

export function validPlacement(placement: Placement): boolean {
  if (placement.listId !== undefined) {
    return placement.date === undefined && !!placement.listId;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(placement.date ?? "")) return false;
  const date = new Date(`${placement.date}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === placement.date
  );
}
