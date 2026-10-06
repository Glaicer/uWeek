import "./search.css";
import { calendarDate } from "./calendar";
import { openTaskEditor, type TaskActions } from "./editor";
import type { Task } from "./model";
import type { PlannerStorage } from "./storage";

export function mountSearch(
  header: HTMLElement,
  storage: PlannerStorage,
  actions: TaskActions,
  refreshBoard: () => Promise<void>,
  goToTask: (task: Task) => Promise<void>,
): void {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.textContent = "Поиск";
  trigger.dataset.searchTrigger = "";
  header.append(trigger);
  trigger.addEventListener("click", async () => {
    const dialog = document.createElement("dialog");
    dialog.className = "task-search";
    dialog.setAttribute("aria-labelledby", "search-title");
    dialog.innerHTML = `
      <h2 id="search-title">Поиск задач</h2>
      <label>Поиск по тексту<input type="search"></label>
      <label class="check-label"><input type="checkbox" data-completed checked>Включать выполненные</label>
      <label class="check-label"><input type="checkbox" data-overdue>Просроченные</label>
      <p role="status" aria-live="polite"></p>
      <ul aria-label="Результаты поиска"></ul>
      <nav aria-label="Страницы результатов"><button type="button" data-previous>Предыдущая страница</button><span data-page></span><button type="button" data-next>Следующая страница</button></nav>
      <button type="button" data-close>Закрыть поиск</button>`;
    const query = dialog.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    const completed =
      dialog.querySelector<HTMLInputElement>("[data-completed]")!;
    const overdue = dialog.querySelector<HTMLInputElement>("[data-overdue]")!;
    const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
    const results = dialog.querySelector("ul")!;
    const previous =
      dialog.querySelector<HTMLButtonElement>("[data-previous]")!;
    const next = dialog.querySelector<HTMLButtonElement>("[data-next]")!;
    const pageLabel = dialog.querySelector<HTMLElement>("[data-page]")!;
    let page = 0;
    let revision = 0;
    const close = () => {
      dialog.close();
      dialog.remove();
      document
        .querySelector<HTMLButtonElement>("header [data-search-trigger]")
        ?.focus();
    };
    const renderResults = async () => {
      const currentRevision = ++revision;
      try {
        const snapshot = await storage.readSnapshot();
        if (!dialog.isConnected || currentRevision !== revision) return;
        const text = query.value.toLowerCase();
        const today = calendarDate(new Date());
        const listOrder = new Map(
          snapshot.lists.map((list) => [list.id, list.order]),
        );
        const matches = snapshot.tasks
          .filter(
            (task) =>
              (completed.checked || !task.completed) &&
              (!overdue.checked ||
                (!task.completed &&
                  task.placement.date !== undefined &&
                  task.placement.date < today)) &&
              [
                task.title,
                task.notes ?? "",
                ...(task.checklist ?? []).map((item) => item.text),
              ].some((value) => value.toLowerCase().includes(text)),
          )
          .sort((a, b) => {
            const first = a.placement.date;
            const second = b.placement.date;
            if (first !== undefined && second !== undefined)
              return (
                first.localeCompare(second) ||
                a.order - b.order ||
                a.id.localeCompare(b.id)
              );
            if (first !== undefined) return -1;
            if (second !== undefined) return 1;
            return (
              listOrder.get(a.placement.listId!)! -
                listOrder.get(b.placement.listId!)! ||
              a.order - b.order ||
              a.id.localeCompare(b.id)
            );
          });
        const pages = Math.max(1, Math.ceil(matches.length / 50));
        page = Math.min(page, pages - 1);
        pageLabel.textContent = `Страница ${page + 1} из ${pages}`;
        previous.disabled = page === 0;
        next.disabled = page === pages - 1;
        results.replaceChildren();
        status.textContent = matches.length
          ? `Найдено: ${matches.length}`
          : "Ничего не найдено";
        for (const task of matches.slice(page * 50, (page + 1) * 50)) {
          const row = document.createElement("li");
          row.dataset.taskId = task.id;
          const title = document.createElement("button");
          title.type = "button";
          title.textContent = task.title;
          const place =
            task.placement.date ??
            snapshot.lists.find((list) => list.id === task.placement.listId)!
              .title;
          const detail = document.createElement("p");
          detail.textContent = `${task.completed ? "Выполнена" : "Не выполнена"} — ${place}`;
          title.addEventListener("click", async () => {
            try {
              await openTaskEditor(task, title, actions, () => {
                void refreshBoard()
                  .then(async () => {
                    await renderResults();
                    const result = [...results.querySelectorAll("li")].find(
                      (entry) => entry.dataset.taskId === task.id,
                    );
                    (
                      result?.querySelector<HTMLButtonElement>("button") ??
                      query
                    ).focus();
                  })
                  .catch(() => {
                    status.textContent =
                      "Не удалось обновить результаты. Повторите поиск.";
                  });
              });
            } catch {
              status.textContent = "Редактор не открыт. Повторите действие.";
            }
          });
          const go = document.createElement("button");
          go.type = "button";
          go.textContent = "Перейти к задаче";
          go.addEventListener("click", async () => {
            try {
              await goToTask(task);
              close();
              document
                .querySelector<HTMLButtonElement>(
                  `[data-task-id="${task.id}"] .task-title`,
                )
                ?.focus();
            } catch {
              status.textContent = "Переход не сохранён. Повторите действие.";
            }
          });
          row.append(title, detail, go);
          results.append(row);
        }
      } catch {
        status.textContent =
          "Поиск недоступен. Проверьте доступ к хранилищу и повторите.";
      }
    };
    const reset = () => {
      page = 0;
      void renderResults();
    };
    query.addEventListener("input", reset);
    completed.addEventListener("change", reset);
    overdue.addEventListener("change", reset);
    previous.addEventListener("click", () => {
      page--;
      void renderResults();
    });
    next.addEventListener("click", () => {
      page++;
      void renderResults();
    });
    dialog.querySelector("[data-close]")!.addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    document.body.append(dialog);
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });
    dialog.showModal();
    query.focus();
    await renderResults();
  });
}
