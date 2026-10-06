import type { TaskActions } from "../src/editor";
import type { Placement, Task } from "../src/model";

const gestures = new WeakMap<EventTarget, { id?: string; pending: boolean }>();
const taskType = "application/x-yourweek-task";

export function attachTaskDragSource(
  button: HTMLButtonElement,
  id: string,
  actions: TaskActions,
): () => void {
  button.draggable = true;
  const onDragStart = (event: DragEvent) => {
    const gesture = gestures.get(actions.taskChanges);
    if (!event.dataTransfer || !gesture || gesture.pending) {
      event.preventDefault();
      return;
    }
    gesture.id = id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(taskType, id);
  };
  const onDragEnd = () => {
    const gesture = gestures.get(actions.taskChanges);
    if (gesture) gesture.id = undefined;
  };
  button.addEventListener("dragstart", onDragStart);
  button.addEventListener("dragend", onDragEnd);
  return () => {
    button.removeEventListener("dragstart", onDragStart);
    button.removeEventListener("dragend", onDragEnd);
    button.draggable = false;
  };
}

export function attachTaskDropTarget(
  section: HTMLElement,
  placement: Placement,
  hideCompleted: boolean,
  actions: TaskActions,
  publish: (tasks: Task[]) => void,
  showStatus: (text: string) => void,
): () => void {
  if (!gestures.has(actions.taskChanges))
    gestures.set(actions.taskChanges, { pending: false });
  const gesture = gestures.get(actions.taskChanges)!;
  const onDragOver = (event: DragEvent) => {
    if (
      !gesture.id ||
      gesture.pending ||
      !event.dataTransfer?.types.includes(taskType)
    )
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  const drop = async (event: DragEvent) => {
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
            hideCompleted,
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
            hideCompleted,
          ),
        );
      } else {
        publish([await actions.updateTask(id, { placement })]);
      }
      showStatus("Перемещение сохранено");
    } catch {
      showStatus("Перемещение не сохранено. Повторите действие.");
    } finally {
      gesture.pending = false;
    }
  };
  const onDrop = (event: DragEvent) => {
    void drop(event);
  };
  section.addEventListener("dragover", onDragOver);
  section.addEventListener("drop", onDrop);
  return () => {
    section.removeEventListener("dragover", onDragOver);
    section.removeEventListener("drop", onDrop);
  };
}
