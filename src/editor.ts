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
      <section aria-labelledby="checklist-title">
        <h3 id="checklist-title">Чек-лист</h3>
        <ol class="checklist"></ol>
        <button type="button" data-add-item>Добавить пункт</button>
      </section>
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
  const checklist = (task.checklist ?? [])
    .map((item) => ({ ...item }))
    .sort((a, b) => a.order - b.order);
  const list = dialog.querySelector<HTMLOListElement>(".checklist")!;
  const renderChecklist = () => {
    list.replaceChildren();
    checklist.forEach((item, index) => {
      const row = document.createElement("li");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.completed;
      checkbox.setAttribute("aria-label", `Выполнен пункт ${index + 1}`);
      checkbox.addEventListener("change", () => {
        item.completed = checkbox.checked;
      });
      const text = document.createElement("textarea");
      text.id = `checklist-${item.id}`;
      text.rows = Math.max(2, item.text.split("\n").length);
      text.required = true;
      text.value = item.text;
      text.setAttribute("aria-label", `Текст пункта ${index + 1}`);
      text.addEventListener("input", () => {
        item.text = text.value;
      });
      const actions = document.createElement("div");
      actions.className = "editor-actions";
      for (const [label, offset] of [
        ["вверх", -1],
        ["вниз", 1],
      ] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label === "вверх" ? "Вверх" : "Вниз";
        button.setAttribute(
          "aria-label",
          `Переместить пункт ${index + 1} ${label}`,
        );
        button.addEventListener("click", () => {
          const target = index + offset;
          if (target < 0 || target >= checklist.length) return;
          [checklist[index], checklist[target]] = [
            checklist[target],
            checklist[index],
          ];
          checklist.forEach((entry, order) => {
            entry.order = order;
          });
          renderChecklist();
          const buttons = list.children[target].querySelectorAll("button");
          buttons[offset === -1 ? 0 : 1].focus();
        });
        actions.append(button);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Удалить пункт";
      remove.setAttribute("aria-label", `Удалить пункт ${index + 1}`);
      remove.addEventListener("click", () => {
        checklist.splice(index, 1);
        checklist.forEach((entry, order) => {
          entry.order = order;
        });
        renderChecklist();
        const next = list.children[Math.min(index, checklist.length - 1)];
        if (next) next.querySelector("textarea")!.focus();
        else
          dialog.querySelector<HTMLButtonElement>("[data-add-item]")!.focus();
      });
      actions.append(remove);
      row.append(checkbox, text, actions);
      list.append(row);
    });
  };
  renderChecklist();
  dialog.querySelector("[data-add-item]")!.addEventListener("click", () => {
    checklist.push({
      id: crypto.randomUUID(),
      text: "",
      completed: false,
      order: Math.max(-1, ...checklist.map((item) => item.order)) + 1,
    });
    renderChecklist();
    list.lastElementChild!.querySelector("textarea")!.focus();
  });
  const draft = (): TaskEdits => ({
    title: title.value,
    notes: notes.value,
    color: (color.value || undefined) as TaskColor | undefined,
    completed: completed.checked,
    ...(task.checklist !== undefined || checklist.length ? { checklist } : {}),
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
