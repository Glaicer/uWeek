import type { Task } from "./model";
import { openTaskEditor, type TaskActions } from "./editor";
import { samePlacement } from "./placement";
import { taskDragSource, taskDropTarget } from "./drag";

export function renderTaskContainer(
  section: HTMLElement,
  label: string,
  tasks: Task[],
  createTask: (title: string) => Promise<Task>,
  actions: TaskActions,
  status: HTMLElement,
  filter: HTMLInputElement,
): void {
  const list = document.createElement("ul");
  list.setAttribute("aria-label", `Задачи: ${label}`);
  const placement = section.dataset.date
    ? { date: section.dataset.date }
    : { listId: section.dataset.listId! };
  const publish = (changed: Task[]) =>
    actions.taskChanges.dispatchEvent(
      new CustomEvent("tasks", { detail: changed }),
    );
  taskDropTarget(section, placement, actions, status, filter, publish);
  const renderTasks = () => {
    const active = document.activeElement as HTMLElement | null;
    const focusedId =
      active?.closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
    const direction = active?.dataset.direction;
    list.replaceChildren();
    tasks
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .forEach(appendTask);
    if (focusedId) {
      const row = list.querySelector<HTMLElement>(
        `[data-task-id="${focusedId}"]`,
      );
      const button = direction
        ? row?.querySelector<HTMLButtonElement>(
            `[data-direction="${direction}"]`,
          )
        : undefined;
      if (button && !button.disabled) button.focus();
      else row?.querySelector<HTMLButtonElement>(".task-title")?.focus();
    }
  };
  actions.taskChanges.addEventListener("tasks", (event) => {
    const changed = (event as CustomEvent<Task[]>).detail;
    if (
      !changed.some(
        (entry) =>
          samePlacement(entry.placement, placement) ||
          tasks.some((task) => task.id === entry.id),
      )
    )
      return;
    tasks = tasks.filter(
      (task) => !changed.some((entry) => entry.id === task.id),
    );
    tasks.push(
      ...changed.filter((task) => samePlacement(task.placement, placement)),
    );
    renderTasks();
  });
  actions.taskChanges.addEventListener("filter", renderTasks);
  const appendTask = (task: Task) => {
    const item = document.createElement("li");
    item.className = "task-row";
    item.dataset.taskId = task.id;
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "task-title";
    taskDragSource(edit, task.id, actions);
    const refresh = () => {
      edit.textContent = task.title;
      toggle.checked = task.completed;
      toggle.setAttribute("aria-label", `Выполнена: ${task.title}`);
      item.dataset.completed = String(task.completed);
      item.dataset.color = task.color ?? "";
      item.classList.toggle("completed", task.completed);
      item.hidden = filter.checked && task.completed;
    };
    refresh();
    edit.addEventListener("click", async () => {
      edit.disabled = true;
      try {
        await openTaskEditor(task, edit, actions, (saved) => {
          if (!saved) {
            tasks = tasks.filter((entry) => entry.id !== task.id);
            renderTasks();
          } else publish([saved]);
          status.textContent = saved ? "Изменения сохранены" : "Задача удалена";
        });
      } catch {
        status.textContent = "Редактор не открыт. Повторите действие.";
      } finally {
        edit.disabled = false;
      }
    });
    toggle.addEventListener("change", async () => {
      toggle.disabled = true;
      edit.disabled = true;
      try {
        task = await actions.updateTask(task.id, { completed: toggle.checked });
        publish([task]);
        status.textContent = "Выполнение сохранено";
        if (filter.checked && task.completed) filter.focus();
      } catch {
        toggle.checked = task.completed;
        status.textContent = "Выполнение не сохранено. Повторите действие.";
      } finally {
        toggle.disabled = false;
        edit.disabled = false;
      }
    });
    item.append(toggle, edit);
    const orderControls = document.createElement("div");
    orderControls.className = "task-order";
    item.append(orderControls);
    const visible = tasks.filter(
      (entry) => !filter.checked || !entry.completed,
    );
    const index = visible.findIndex((entry) => entry.id === task.id);
    for (const [label, offset, position] of [
      ["Выше", -1, "before"],
      ["Ниже", 1, "after"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.direction = position;
      button.setAttribute("aria-label", `${label}: ${task.title}`);
      const target = visible[index + offset];
      button.disabled = !target || index === -1;
      button.addEventListener("click", async () => {
        const wasFocused = document.activeElement === button;
        button.disabled = true;
        try {
          publish(
            await actions.reorderTask(
              task.id,
              target.id,
              position,
              filter.checked,
            ),
          );
          if (wasFocused) {
            const row = list.querySelector<HTMLElement>(
              `[data-task-id="${task.id}"]`,
            );
            const control = row?.querySelector<HTMLButtonElement>(
              `[data-direction="${position}"]`,
            );
            if (control && !control.disabled) control.focus();
            else row?.querySelector<HTMLButtonElement>(".task-title")?.focus();
          }
          status.textContent = "Порядок сохранён";
        } catch {
          button.disabled = false;
          if (wasFocused) button.focus();
          status.textContent = "Порядок не сохранён. Повторите действие.";
        }
      });
      orderControls.append(button);
    }
    list.append(item);
  };
  renderTasks();
  section.append(list);
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Новая задача";
  input.setAttribute("aria-label", `Новая задача: ${label}`);
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Добавить";
  form.append(input, button);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      status.textContent = "Ввод отменён";
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input.value.trim() || input.disabled) return;
    input.disabled = true;
    button.disabled = true;
    status.textContent = "Сохранение…";
    try {
      const task = await createTask(input.value);
      publish([task]);
      input.value = "";
      status.textContent = "Задача сохранена";
    } catch {
      status.textContent =
        "Задача не сохранена: запись в этом браузере недоступна. Проверьте доступ к хранилищу и повторите «Добавить». Ваш текст сохранён в поле ввода.";
    } finally {
      input.disabled = false;
      button.disabled = false;
      input.focus();
    }
  });
  section.append(form);
}
