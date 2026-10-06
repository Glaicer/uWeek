import { calendarDate, formatDate } from "./calendar";
import type { Task, SomedayList } from "./model";
import { renderLists, type ListActions } from "./lists";
import { renderTaskContainer } from "./task-container";

export interface BoardTaskActions extends ListActions {
  hideCompleted: boolean;
  saveHideCompleted: (value: boolean) => Promise<void>;
}

export function renderBoard(
  root: HTMLElement,
  days: Date[],
  today: string,
  tasks: Task[],
  lists: SomedayList[],
  createTask: (title: string, date: string) => Promise<Task>,
  actions: BoardTaskActions,
): void {
  root.innerHTML = `
    <header><p class="brand">YourWeek</p><h1></h1><p>Неделя для ваших планов — без спешки и расписания по часам.</p></header>
    <aside aria-label="Хранение данных"><strong>Ваши данные остаются в этом браузере.</strong> Облачной синхронизации нет. Очистка данных сайта может удалить задачи; приватный режим не гарантирует сохранность. Используйте один браузерный профиль и одну рабочую вкладку.</aside>
    <p class="feedback" role="status" aria-live="polite"></p>
    <label class="hide-completed check-label"><input type="checkbox">Скрыть выполненные</label>
    <div class="week"></div>
    <section class="someday" aria-labelledby="someday-title"><h2 id="someday-title">Когда-нибудь</h2><div class="lists"></div></section>`;
  root.querySelector("h1")!.textContent =
    `${formatDate(days[0])} – ${formatDate(days[6])}`;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  const filter = root.querySelector<HTMLInputElement>(".hide-completed input")!;
  filter.checked = actions.hideCompleted;
  const applyFilter = () => {
    for (const item of root.querySelectorAll<HTMLElement>("[data-task-id]")) {
      item.hidden = filter.checked && item.dataset.completed === "true";
    }
  };
  filter.addEventListener("change", async () => {
    filter.disabled = true;
    try {
      await actions.saveHideCompleted(filter.checked);
      actions.hideCompleted = filter.checked;
      applyFilter();
      actions.taskChanges.dispatchEvent(new CustomEvent("filter"));
      status.textContent = "Настройка сохранена";
    } catch {
      filter.checked = actions.hideCompleted;
      status.textContent = "Настройка не сохранена. Повторите действие.";
    } finally {
      filter.disabled = false;
    }
  });
  for (const day of days) {
    const date = calendarDate(day);
    const label = new Intl.DateTimeFormat("ru", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(day);
    const section = document.createElement("section");
    section.className = "day";
    section.dataset.date = date;
    section.setAttribute("aria-label", label);
    if (date === today) section.classList.add("today");
    const heading = document.createElement("h2");
    heading.textContent = label;
    section.append(heading);
    if (date === today) {
      const marker = document.createElement("p");
      marker.className = "today-marker";
      marker.textContent = "Сегодня";
      section.append(marker);
    }
    renderTaskContainer(
      section,
      label,
      tasks.filter((task) => task.placement.date === date),
      (title) => createTask(title, date),
      actions,
      status,
      filter,
    );
    root.querySelector(".week")!.append(section);
  }
  renderLists(
    root.querySelector<HTMLElement>(".someday")!,
    lists,
    actions,
    status,
    filter,
  );
}
