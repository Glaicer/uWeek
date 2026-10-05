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
}

export interface SomedayList {
  id: string;
  title: string;
  order: number;
}

export interface PlannerSettings {
  weekStartsOn: 0 | 1;
}
