import type { TaskActions } from "./editor";
import type { Placement, Task } from "./model";

const gestures = new WeakMap<EventTarget, { id?: string; pending: boolean }>();
const taskType = "application/x-yourweek-task";

export function taskDragSource(
  button: HTMLButtonElement,
  id: string,
  actions: TaskActions,
): void {
  button.draggable = true;
  button.addEventListener("dragstart", (event) => {
    const gesture = gestures.get(actions.taskChanges);
    if (!event.dataTransfer || !gesture || gesture.pending) {
      event.preventDefault();
      return;
    }
    gesture.id = id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(taskType, id);
  });
  button.addEventListener("dragend", () => {
    const gesture = gestures.get(actions.taskChanges);
    if (gesture) gesture.id = undefined;
  });
}

export function taskDropTarget(
  section: HTMLElement,
  placement: Placement,
  actions: TaskActions,
  status: HTMLElement,
  filter: HTMLInputElement,
  publish: (tasks: Task[]) => void,
): void {
  if (!gestures.has(actions.taskChanges))
    gestures.set(actions.taskChanges, { pending: false });
  const gesture = gestures.get(actions.taskChanges)!;
  section.addEventListener("dragover", (event) => {
    if (
      !gesture.id ||
      gesture.pending ||
      !event.dataTransfer?.types.includes(taskType)
    )
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  section.addEventListener("drop", async (event) => {
    if (
      !gesture.id ||
      gesture.pending ||
      event.dataTransfer?.getData(taskType) !== gesture.id
    )
      return;
    event.preventDefault();
    const id = gesture.id;
    gesture.id = undefined;
    const row = (event.target as Element).closest<HTMLElement>(
      "[data-task-id]",
    );
    if (row?.dataset.taskId === id) return;
    gesture.pending = true;
    try {
      if (row && section.contains(row) && !row.hidden) {
        const bounds = row.getBoundingClientRect();
        publish(
          await actions.reorderTask(
            id,
            row.dataset.taskId!,
            event.clientY < bounds.y + bounds.height / 2 ? "before" : "after",
            filter.checked,
          ),
        );
      } else if (section.querySelector(`[data-task-id="${id}"]`)) {
        const last = [
          ...section.querySelectorAll<HTMLElement>(".task-row:not([hidden])"),
        ]
          .filter((entry) => entry.dataset.taskId !== id)
          .at(-1);
        if (!last) return;
        publish(
          await actions.reorderTask(
            id,
            last.dataset.taskId!,
            "after",
            filter.checked,
          ),
        );
      } else {
        publish([await actions.updateTask(id, { placement })]);
      }
      status.textContent = "Перемещение сохранено";
    } catch {
      status.textContent = "Перемещение не сохранено. Повторите действие.";
    } finally {
      gesture.pending = false;
    }
  });
}
