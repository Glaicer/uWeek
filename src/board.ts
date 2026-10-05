import { calendarDate, formatDate } from "./calendar";
import type { Task, SomedayList } from "./model";

export function renderBoard(
  root: HTMLElement,
  days: Date[],
  today: string,
  tasks: Task[],
  lists: SomedayList[],
  createTask: (title: string, date: string) => Promise<Task>,
): void {
  root.innerHTML = `
    <header><p class="brand">YourWeek</p><h1></h1><p>Неделя для ваших планов — без спешки и расписания по часам.</p></header>
    <aside aria-label="Хранение данных"><strong>Ваши данные остаются в этом браузере.</strong> Облачной синхронизации нет. Очистка данных сайта может удалить задачи; приватный режим не гарантирует сохранность. Используйте один браузерный профиль и одну рабочую вкладку.</aside>
    <p class="feedback" role="status" aria-live="polite"></p>
    <div class="week"></div>
    <section class="someday" aria-labelledby="someday-title"><h2 id="someday-title">Когда-нибудь</h2><p>Списки для будущих идей. Добавление задач без даты появится позже.</p><div class="lists"></div></section>`;
  root.querySelector("h1")!.textContent =
    `${formatDate(days[0])} – ${formatDate(days[6])}`;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  for (const day of days) {
    const date = calendarDate(day);
    const label = new Intl.DateTimeFormat("ru", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(day);
    const section = document.createElement("section");
    section.className = "day";
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
    const list = document.createElement("ul");
    list.setAttribute("aria-label", `Задачи: ${label}`);
    const appendTask = (task: Task) => {
      const item = document.createElement("li");
      item.textContent = task.title;
      item.dataset.taskId = task.id;
      list.append(item);
    };
    tasks.filter((task) => task.placement.date === date).forEach(appendTask);
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
        const task = await createTask(input.value, date);
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
    root.querySelector(".week")!.append(section);
  }
  for (const list of lists) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = list.title;
    const empty = document.createElement("p");
    empty.textContent = "Пока пусто";
    section.append(heading, empty);
    root.querySelector(".lists")!.append(section);
  }
}
