import type { Placement } from "./model";
import { validCalendarDate } from "./calendar";

export function samePlacement(a: Placement, b: Placement): boolean {
  return a.date === b.date && a.listId === b.listId;
}

export function validPlacement(placement: Placement): boolean {
  if (placement.listId !== undefined) {
    return placement.date === undefined && !!placement.listId;
  }
  return validCalendarDate(placement.date ?? "");
}
