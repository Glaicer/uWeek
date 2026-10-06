import { prepareCsv, type CsvPreview } from "./csv";
import type { PlannerStorage } from "./storage";

export function mountCsvImport(
  root: HTMLElement,
  storage: PlannerStorage,
  refresh: () => Promise<void>,
): void {
  const host = root.parentElement!;
  const label = document.createElement("label");
  label.textContent = "Tweek CSV";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,text/csv";
  label.append(input);
  const status = host.querySelector<HTMLElement>(".feedback")!;
  root.append(label);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    status.textContent = "Проверка CSV…";
    let preview: CsvPreview;
    let newListTitles: readonly string[];
    try {
      preview = await prepareCsv(file);
      const lists = await storage.readLists();
      newListTitles = preview.listTitles.filter(
        (title) =>
          !lists.some(
            (list) => list.title.trim().toLowerCase() === title.toLowerCase(),
          ),
      );
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Не удалось прочитать CSV";
      input.disabled = false;
      input.value = "";
      return;
    }
    status.textContent = "";
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Импорт CSV");
    const heading = document.createElement("h2");
    heading.textContent = "Импорт CSV";
    const summary = document.createElement("p");
    summary.textContent = `Задач: ${preview.records.length}. Выполненных: ${preview.completed}. Невыполненных: ${preview.records.length - preview.completed}. Без даты: ${preview.undated}. Создаваемые списки: ${newListTitles.join(", ") || "нет"}. Пустых записей: ${preview.emptyRecords}. Точные повторные вхождения: ${preview.duplicateOccurrences}. Диапазон дат: ${preview.firstDate ?? "нет"} — ${preview.lastDate ?? "нет"}.`;
    const warning = document.createElement("p");
    warning.textContent =
      "CSV не содержит правил повторения; повторяющиеся серии не восстанавливаются. Новый файл добавляет все строки и может повторять прежние задачи. Повтор тех же исходных байтов добавляет ноль задач. Файл остаётся на устройстве.";
    const list = document.createElement("ol");
    for (const record of preview.records.slice(0, 20)) {
      const item = document.createElement("li");
      item.textContent = `Запись ${record.recordNumber}: ${record.date || `Без даты — ${record.listTitle}`} — ${record.title} (${record.completed ? "выполнена" : "не выполнена"})`;
      list.append(item);
    }
    const progress = document.createElement("p");
    progress.setAttribute("role", "status");
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Подтвердить импорт";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Отмена";
    let writing = false;
    function close(): void {
      dialog.close();
      dialog.remove();
      input.disabled = false;
      input.value = "";
      input.focus();
    }
    cancel.addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (!writing) close();
    });
    confirm.addEventListener("click", async () => {
      if (writing) return;
      writing = true;
      confirm.disabled = true;
      cancel.hidden = true;
      progress.textContent =
        "Запись импорта… Отменить начавшуюся запись нельзя.";
      let result: Awaited<ReturnType<PlannerStorage["commitCsv"]>>;
      try {
        result = await storage.commitCsv(preview);
      } catch {
        writing = false;
        confirm.disabled = false;
        cancel.hidden = false;
        progress.textContent =
          "Импорт не сохранён. База не изменена. Повторите попытку.";
        return;
      }
      let viewError = false;
      try {
        await refresh();
      } catch {
        viewError = true;
      }
      close();
      host.querySelector<HTMLElement>(".feedback")!.textContent =
        `Добавлено задач: ${result.addedTasks}. Пустых записей: ${result.emptyRecords}.${result.repeated ? " Этот файл уже импортирован." : ""}${viewError ? " Импорт сохранён, но доска не обновилась. Перезагрузите страницу." : ""}`;
      host.querySelector<HTMLInputElement>('input[type="file"]')?.focus();
    });
    dialog.append(heading, summary, warning, list, progress, confirm, cancel);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
