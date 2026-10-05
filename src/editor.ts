import { taskColors, type Task, type TaskColor, type TaskEdits } from "./model";

export interface TaskActions {
  updateTask: (id: string, edits: Partial<TaskEdits>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
}

export function openTaskEditor(
  task: Task,
  trigger: HTMLElement,
  actions: TaskActions,
  changed: (task: Task | null) => void,
): void {
  const dialog = document.createElement("dialog");
  dialog.className = "task-editor";
  dialog.setAttribute("aria-labelledby", "editor-title");
  dialog.innerHTML = `
    <h2 id="editor-title">Редактор задачи</h2>
    <form>
      <label>Название<input name="title" required></label>
      <label>Заметка<textarea name="notes" rows="7"></textarea></label>
      <label>Цвет<select name="color"><option value="">Без цвета</option></select></label>
      <label class="check-label"><input name="completed" type="checkbox">Выполнена</label>
      <p role="alert"></p>
      <div class="editor-actions"><button type="submit">Сохранить</button><button type="button" data-cancel>Отмена</button><button type="button" data-delete>Удалить задачу</button></div>
    </form>`;
  const form = dialog.querySelector("form")!;
  const title = form.elements.namedItem("title") as HTMLInputElement;
  const notes = form.elements.namedItem("notes") as HTMLTextAreaElement;
  const color = form.elements.namedItem("color") as HTMLSelectElement;
  const completed = form.elements.namedItem("completed") as HTMLInputElement;
  const alert = dialog.querySelector<HTMLElement>('[role="alert"]')!;
  for (const [value, label] of Object.entries(taskColors)) {
    color.add(new Option(label, value));
  }
  title.value = task.title;
  notes.value = task.notes ?? "";
  color.value = task.color ?? "";
  completed.checked = task.completed;
  const draft = (): TaskEdits => ({
    title: title.value,
    notes: notes.value,
    color: (color.value || undefined) as TaskColor | undefined,
    completed: completed.checked,
  });
  const initial = JSON.stringify(draft());
  let busy = false;
  const close = () => {
    dialog.close();
    dialog.remove();
    if (trigger.isConnected && !trigger.closest("[hidden]")) trigger.focus();
    else
      document
        .querySelector<HTMLInputElement>(".hide-completed input")
        ?.focus();
  };
  const cancel = () => {
    if (busy) return;
    if (
      JSON.stringify(draft()) !== initial &&
      !window.confirm("Отказаться от несохранённых изменений?")
    )
      return;
    close();
  };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancel();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)",
      ),
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.querySelector("[data-cancel]")!.addEventListener("click", cancel);
  const save = async (remove: boolean) => {
    if (busy) return;
    busy = true;
    for (const element of Array.from(form.elements)) {
      (element as HTMLInputElement).disabled = true;
    }
    alert.textContent = "";
    try {
      if (remove) {
        await actions.deleteTask(task.id);
        changed(null);
      } else {
        const saved = await actions.updateTask(task.id, draft());
        changed(saved);
      }
      close();
    } catch {
      alert.textContent =
        "Изменения не сохранены: запись в этом браузере недоступна. Черновик оставлен открытым; повторите действие.";
    } finally {
      busy = false;
      for (const element of Array.from(form.elements)) {
        (element as HTMLInputElement).disabled = false;
      }
    }
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!title.value.trim()) {
      alert.textContent = "Введите непустое название задачи";
      title.focus();
      return;
    }
    void save(false);
  });
  dialog.querySelector("[data-delete]")!.addEventListener("click", () => {
    if (
      !busy &&
      window.confirm(`Удалить задачу «${task.title}» и все её данные?`)
    )
      void save(true);
  });
  document.body.append(dialog);
  dialog.showModal();
  title.focus();
}
