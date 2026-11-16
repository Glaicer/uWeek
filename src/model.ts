import type { CsvFields } from "./csv";

export interface ImportHistory {
  fingerprint: string;
  importedAt: string;
  addedTasks: number;
  emptyRecords: number;
}

export interface CsvProvenance {
  readonly fingerprint: string;
  readonly recordNumber: number;
  readonly fields: CsvFields;
}

export type Placement =
  { date: string; listId?: never } | { listId: string; date?: never };

export const taskColors = {
  red: "Красный",
  orange: "Оранжевый",
  yellow: "Жёлтый",
  green: "Зелёный",
  blue: "Синий",
  purple: "Фиолетовый",
} as const;

export type TaskColor = keyof typeof taskColors;
export const taskColorValues = Object.keys(taskColors) as TaskColor[];
export type TaskEdits = Pick<
  Task,
  "title" | "notes" | "color" | "completed" | "checklist" | "placement"
>;

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  order: number;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  notes?: string;
  color?: TaskColor;
  checklist?: ChecklistItem[];
  placement: Placement;
  order: number;
  readonly provenance?: CsvProvenance;
}

export interface SomedayList {
  id: string;
  title: string;
  order: number;
}

export interface PlannerSettings {
  weekStartsOn: 0 | 1;
}

export interface PlannerSnapshot {
  tasks: Task[];
  lists: SomedayList[];
  settings: PlannerSettings;
  hideCompleted: boolean;
  selectedWeek: string | undefined;
  importHistory: ImportHistory[];
}
