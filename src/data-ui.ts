import { createBackup, prepareBackup } from "./backup";
import { mountCsvImport } from "./import-ui";
import type { PlannerStorage } from "./storage";

export function mountData(
  root: HTMLElement,
  storage: PlannerStorage,
  refresh: () => Promise<void>,
  restored: () => Promise<void>,
): void {
  const section = document.createElement("section");
  section.setAttribute("aria-label", "Данные");
  const heading = document.createElement("h2");
  heading.textContent = "Данные";
  const warning = document.createElement("p");
  warning.textContent =
    "Данные хранятся только в этом origin (адресе сайта) и профиле браузера. Очистка данных сайта, удаление профиля и приватный режим могут удалить план. Для переноса между устройствами скачайте и вручную перенесите копию. JSON содержит личные данные открытым текстом, без шифрования. Постоянное хранение не заменяет резервную копию.";
  const status = () => root.querySelector<HTMLElement>(".feedback")!;
  function button(label: string): HTMLButtonElement {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    return element;
  }
  async function download(): Promise<void> {
    const backup = createBackup(await storage.readSnapshot());
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `yourweek-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const exportButton = button("Скачать резервную копию");
  exportButton.addEventListener(
    "click",
    () =>
      void download().catch(() => {
        status().textContent = "Не удалось скачать копию. Повторите попытку.";
      }),
  );
  const label = document.createElement("label");
  label.textContent = "Восстановить JSON";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  label.append(input);
  const persist = button("Запросить постоянное хранение");
  const persistence = document.createElement("p");
  persistence.setAttribute("aria-live", "polite");
  persistence.setAttribute("aria-label", "Результат постоянного хранения");
  if (!navigator.storage?.persist) {
    persist.disabled = true;
    persistence.textContent =
      "Постоянное хранение не поддерживается браузером.";
  }
  persist.addEventListener("click", async () => {
    persist.disabled = true;
    try {
      persistence.textContent = (await navigator.storage.persist())
        ? "Постоянное хранение разрешено. Резервная копия всё равно необходима."
        : "Постоянное хранение не разрешено. Работа доступна; сохраняйте резервные копии.";
    } catch {
      persistence.textContent =
        "Не удалось запросить постоянное хранение. Работа доступна; сохраняйте резервные копии.";
    } finally {
      persist.disabled = false;
    }
  });
  section.append(heading, warning);
  root.append(section);
  mountCsvImport(section, storage, refresh);
  section.append(exportButton, label, persist, persistence);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    let backup;
    try {
      backup = await prepareBackup(file);
    } catch (error) {
      status().textContent =
        error instanceof Error ? error.message : "Не удалось проверить копию";
      input.disabled = false;
      input.value = "";
      return;
    }
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Восстановление копии");
    const summary = document.createElement("p");
    summary.textContent = `Задач: ${backup.tasks.length}. Списков: ${backup.lists.length}. Все текущие данные, настройки и история импорта будут полностью заменены, не объединены. Откроется текущая неделя.`;
    const progress = document.createElement("p");
    progress.setAttribute("role", "status");
    const current = button("Скачать текущую копию");
    current.addEventListener(
      "click",
      () =>
        void download().catch(() => {
          progress.textContent = "Не удалось скачать текущую копию.";
        }),
    );
    const confirm = button("Заменить все данные");
    const cancel = button("Отмена");
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
      cancel.disabled = true;
      current.disabled = true;
      progress.textContent = "Замена данных…";
      try {
        await storage.restoreBackup(backup);
      } catch {
        writing = false;
        confirm.disabled = false;
        cancel.disabled = false;
        current.disabled = false;
        progress.textContent =
          "Восстановление не сохранено. База не изменена. Повторите попытку.";
        return;
      }
      close();
      try {
        await restored();
        status().textContent = "Копия восстановлена. Открыта текущая неделя.";
      } catch {
        status().textContent =
          "Копия восстановлена, но доска не обновилась. Перезагрузите страницу.";
      }
    });
    dialog.append(summary, progress, current, confirm, cancel);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
