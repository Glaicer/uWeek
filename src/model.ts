export type Placement =
  { date: string; listId?: never } | { listId: string; date?: never };

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  placement: Placement;
  order: number;
}

export interface SomedayList {
  id: string;
  title: string;
  order: number;
}
