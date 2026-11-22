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
