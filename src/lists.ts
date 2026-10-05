import type { SomedayList, Task } from "./model";
import type { TaskActions } from "./editor";
import { renderTaskContainer } from "./task-container";

export interface ListActions extends TaskActions {
  listTasks: Task[];
  createListTask: (title: string, listId: string) => Promise<Task>;
  createList: (title: string) => Promise<SomedayList>;
  renameList: (id: string, title: string) => Promise<SomedayList>;
  deleteList: (id: string) => Promise<void>;
}

export function renderLists(
  root: HTMLElement,
  lists: SomedayList[],
  actions: ListActions,
  status: HTMLElement,
  filter: HTMLInputElement,
): void {
  const containers = root.querySelector<HTMLElement>(".lists")!;
  const appendList = (list: SomedayList) => {
    const section = document.createElement("section");
    section.dataset.listId = list.id;
    const heading = document.createElement("h3");
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "Переименовать список";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Удалить список";
    const form = document.createElement("form");
    form.hidden = true;
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Название списка");
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Сохранить название";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Отмена переименования";
    form.append(input, save, cancel);
    const refresh = () => {
      heading.textContent = list.title;
      section.setAttribute("aria-label", `Список: ${list.title}`);
      section
        .querySelector<HTMLInputElement>('input[placeholder="Новая задача"]')
        ?.setAttribute("aria-label", `Новая задача: ${list.title}`);
      section
        .querySelector("ul")
        ?.setAttribute("aria-label", `Задачи: ${list.title}`);
    };
    rename.addEventListener("click", () => {
      input.value = list.title;
      form.hidden = false;
      input.focus();
    });
    const close = () => {
      form.hidden = true;
      rename.focus();
    };
    cancel.addEventListener("click", close);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      save.disabled = true;
      input.disabled = true;
      try {
        list = await actions.renameList(list.id, input.value);
        refresh();
        close();
        status.textContent = "Название списка сохранено";
      } catch (error) {
        status.textContent = `Название не сохранено. ${error instanceof Error ? error.message : "Повторите действие."}`;
      } finally {
        input.disabled = false;
        save.disabled = false;
      }
    });
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await actions.deleteList(list.id);
        section.remove();
        status.textContent = "Список удалён";
        root
          .querySelector<HTMLInputElement>(
            '[aria-label="Название нового списка"]',
          )!
          .focus();
      } catch (error) {
        status.textContent = `Список не удалён. ${error instanceof Error ? error.message : "Повторите действие."}`;
      } finally {
        remove.disabled = false;
      }
    });
    section.append(heading, rename, remove, form);
    renderTaskContainer(
      section,
      list.title,
      actions.listTasks.filter((task) => task.placement.listId === list.id),
      (title) => actions.createListTask(title, list.id),
      actions,
      status,
      filter,
    );
    refresh();
    containers.append(section);
  };
  lists.forEach(appendList);
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.setAttribute("aria-label", "Название нового списка");
  input.placeholder = "Новый список";
  const add = document.createElement("button");
  add.type = "submit";
  add.textContent = "Добавить список";
  form.append(input, add);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") input.value = "";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (add.disabled) return;
    add.disabled = true;
    input.disabled = true;
    try {
      appendList(await actions.createList(input.value));
      input.value = "";
      status.textContent = "Список сохранён";
    } catch (error) {
      status.textContent = `Список не сохранён. ${error instanceof Error ? error.message : "Повторите действие."}`;
    } finally {
      input.disabled = false;
      add.disabled = false;
      input.focus();
    }
  });
  root.append(form);
}
