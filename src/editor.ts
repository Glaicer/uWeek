import type { Task } from "./model";

export interface TaskActions {
  updateTask: (
    id: string,
    edits: Partial<import("./model").TaskEdits>,
  ) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  readLists: () => Promise<import("./model").SomedayList[]>;
  taskChanges: EventTarget;
  reorderTask: (
    id: string,
    targetId: string,
    position: "before" | "after",
    hideCompleted: boolean,
  ) => Promise<Task[]>;
}

export type TaskEditorOpener = (
  task: Task,
  trigger: HTMLElement,
  actions: TaskActions,
  changed: (task: Task | null) => void,
) => Promise<void>;

let taskEditor: TaskEditorOpener | null = null;

export function provideTaskEditor(opener: TaskEditorOpener | null): void {
  taskEditor = opener;
}

export async function openTaskEditor(
  task: Task,
  trigger: HTMLElement,
  actions: TaskActions,
  changed: (task: Task | null) => void,
): Promise<void> {
  if (!taskEditor) throw new Error("Редактор недоступен. Повторите действие.");
  return taskEditor(task, trigger, actions, changed);
}
