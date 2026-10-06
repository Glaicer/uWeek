import { renderBoard } from "./board";
import { calendarDate, currentWeek } from "./calendar";
import type { PlannerStorage } from "./storage";
import { mountData } from "./data-ui";

function localDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export async function startNavigation(
  root: HTMLElement,
  storage: PlannerStorage,
): Promise<void> {
  const savedWeek = await storage.readSelectedWeek();
  let selected = localDate(savedWeek ?? calendarDate(new Date()));
  if (!savedWeek) await storage.saveSelectedWeek(calendarDate(selected));
  let settings = await storage.readSettings();
  async function render(): Promise<void> {
    const days = currentWeek(selected, settings.weekStartsOn);
    const [tasks, lists, hideCompleted, listTasks] = await Promise.all([
      storage.readWeek(calendarDate(days[0]), calendarDate(days[6])),
      storage.readLists(),
      storage.readHideCompleted(),
      storage.readListTasks(),
    ]);
    renderBoard(
      root,
      days,
      calendarDate(new Date()),
      tasks,
      lists,
      (title, date) => storage.createTask(title, date),
      {
        hideCompleted,
        listTasks,
        createListTask: (title, listId) =>
          storage.createListTask(title, listId),
        createList: (title) => storage.createList(title),
        renameList: (id, title) => storage.renameList(id, title),
        deleteList: (id) => storage.deleteList(id),
        saveHideCompleted: (value) => storage.saveHideCompleted(value),
        updateTask: (id, edits) => storage.updateTask(id, edits),
        deleteTask: (id) => storage.deleteTask(id),
        readLists: () => storage.readLists(),
        taskChanges: new EventTarget(),
        reorderTask: (id, targetId, position, hide) =>
          storage.reorderTask(id, targetId, position, hide),
      },
    );
    const navigation = document.createElement("nav");
    navigation.setAttribute("aria-label", "Навигация по неделям");
    for (const [label, offset] of [
      ["Предыдущая неделя", -7],
      ["Следующая неделя", 7],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener(
        "click",
        () =>
          void change(
            new Date(
              selected.getFullYear(),
              selected.getMonth(),
              selected.getDate() + offset,
              12,
            ),
            label,
          ),
      );
      navigation.append(button);
    }
    const today = document.createElement("button");
    today.type = "button";
    today.textContent = "Сегодня";
    today.addEventListener("click", () => void change(new Date(), "Сегодня"));
    navigation.append(today);
    const form = document.createElement("form");
    const dateLabel = document.createElement("label");
    dateLabel.textContent = "Перейти к дате";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.required = true;
    dateInput.value = calendarDate(selected);
    dateLabel.append(dateInput);
    const go = document.createElement("button");
    go.type = "submit";
    go.textContent = "Перейти";
    form.append(dateLabel, go);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (dateInput.value) void change(localDate(dateInput.value), "Перейти");
    });
    navigation.append(form);
    const startLabel = document.createElement("label");
    startLabel.textContent = "Начало недели";
    const start = document.createElement("select");
    start.innerHTML =
      '<option value="1">Понедельник</option><option value="0">Воскресенье</option>';
    start.value = String(settings.weekStartsOn);
    start.addEventListener("change", async () => {
      start.disabled = true;
      try {
        const next = {
          ...settings,
          weekStartsOn: Number(start.value) as 0 | 1,
        };
        await storage.saveSettings(next);
        settings = next;
        await render();
        root.querySelector<HTMLSelectElement>("nav select")!.focus();
      } catch {
        start.value = String(settings.weekStartsOn);
        root.querySelector('[role="status"]')!.textContent =
          "Настройка не сохранена. Повторите изменение начала недели.";
      } finally {
        start.disabled = false;
      }
    });
    startLabel.append(start);
    navigation.append(startLabel);
    root.querySelector("header")!.append(navigation);
    mountData(root, storage, render, async () => {
      selected = new Date();
      settings = await storage.readSettings();
      await render();
    });
  }
  async function change(date: Date, focus: string): Promise<void> {
    try {
      await storage.saveSelectedWeek(calendarDate(date));
      selected = date;
      await render();
      if (focus === "Сегодня" && window.innerWidth < 1200) {
        root.querySelector(".today")?.scrollIntoView({ block: "start" });
      }
      [...root.querySelectorAll<HTMLButtonElement>("nav button")]
        .find((button) => button.textContent === focus)
        ?.focus({ preventScroll: true });
    } catch {
      root.querySelector('[role="status"]')!.textContent =
        "Переход не сохранён. Проверьте доступ к хранилищу и повторите действие.";
    }
  }
  await render();
}
