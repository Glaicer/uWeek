import type { Task } from "./model";
import { openTaskEditor, type TaskActions } from "./editor";

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
  const appendTask = (task: Task) => {
    const item = document.createElement("li");
    item.className = "task-row";
    item.dataset.taskId = task.id;
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "task-title";
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
    edit.addEventListener("click", () => {
      openTaskEditor(task, edit, actions, (saved) => {
        if (!saved) item.remove();
        else {
          task = saved;
          refresh();
        }
        status.textContent = saved ? "Изменения сохранены" : "Задача удалена";
      });
    });
    toggle.addEventListener("change", async () => {
      toggle.disabled = true;
      edit.disabled = true;
      try {
        task = await actions.updateTask(task.id, { completed: toggle.checked });
        refresh();
        status.textContent = "Выполнение сохранено";
        if (item.hidden) filter.focus();
      } catch {
        toggle.checked = task.completed;
        status.textContent = "Выполнение не сохранено. Повторите действие.";
      } finally {
        toggle.disabled = false;
        edit.disabled = false;
      }
    });
    item.append(toggle, edit);
    list.append(item);
  };
  tasks.forEach(appendTask);
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
      appendTask(task);
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
