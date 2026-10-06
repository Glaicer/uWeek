"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { prepareCsv, type CsvPreview } from "../src/csv";
import type { PlannerStorage } from "../src/storage";

const previewWarning =
  "CSV не содержит правил повторения; повторяющиеся серии не восстанавливаются, после последней выгруженной даты новые вхождения не создаются. Отсутствующие в CSV списки и их задачи не восстанавливаются. Новый файл добавляет все строки и может повторять прежние задачи. Повтор тех же исходных байтов добавляет ноль задач. Файл остаётся на устройстве.";
const writingProgress = "Запись импорта… Отменить начавшуюся запись нельзя.";
const commitFailure =
  "Импорт не сохранён. База не изменена. Повторите попытку.";

type CommitResult = Awaited<ReturnType<PlannerStorage["commitCsv"]>>;

export interface CsvImportProps {
  storage: PlannerStorage;
  refresh: () => Promise<void>;
  showStatus: (text: string) => void;
}

export function CsvImport({ storage, refresh, showStatus }: CsvImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const writingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [newListTitles, setNewListTitles] = useState<readonly string[]>([]);
  const [writing, setWriting] = useState(false);
  const [progress, setProgress] = useState("");

  const close = useCallback(() => {
    dialogRef.current?.close();
    writingRef.current = false;
    setWriting(false);
    setProgress("");
    setPreview(null);
    const input = inputRef.current;
    if (input) {
      input.disabled = false;
      input.value = "";
      input.focus();
    }
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setPreparing(true);
      showStatus("Проверка CSV…");
      try {
        const next = await prepareCsv(file);
        const lists = await storage.readLists();
        setNewListTitles(
          next.listTitles.filter(
            (title) =>
              !lists.some(
                (list) =>
                  list.title.trim().toLowerCase() === title.toLowerCase(),
              ),
          ),
        );
        setPreview(next);
        showStatus("");
      } catch (error) {
        showStatus(
          error instanceof Error ? error.message : "Не удалось прочитать CSV",
        );
        if (inputRef.current) inputRef.current.value = "";
      } finally {
        setPreparing(false);
      }
    },
    [showStatus, storage],
  );

  useEffect(() => {
    if (!preview) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancelEvent = (event: Event) => {
      if (writingRef.current) event.preventDefault();
      else close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
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
    };
    dialog.addEventListener("cancel", onCancelEvent);
    dialog.addEventListener("keydown", onKeyDown);
    if (!dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    return () => {
      dialog.removeEventListener("cancel", onCancelEvent);
      dialog.removeEventListener("keydown", onKeyDown);
    };
  }, [preview, close]);

  const onConfirm = useCallback(async () => {
    if (!preview || writingRef.current) return;
    writingRef.current = true;
    flushSync(() => {
      setWriting(true);
      setProgress(writingProgress);
    });
    let result: CommitResult;
    try {
      result = await storage.commitCsv(preview);
    } catch {
      writingRef.current = false;
      setWriting(false);
      setProgress(commitFailure);
      return;
    }
    let viewError = false;
    try {
      await refresh();
    } catch {
      viewError = true;
    }
    showStatus(
      `Добавлено задач: ${result.addedTasks}. Новых списков: ${result.addedLists}. Пустых записей: ${result.emptyRecords}.${result.repeated ? " Этот файл уже импортирован." : ""}${viewError ? " Импорт сохранён, но доска не обновилась. Перезагрузите страницу." : ""}`,
    );
    close();
  }, [preview, refresh, showStatus, close, storage]);

  return (
    <>
      <label>
        Tweek CSV
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={preparing || preview !== null}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </label>
      {preview ? (
        <dialog ref={dialogRef} aria-label="Импорт CSV">
          <h2>Импорт CSV</h2>
          <p>{`Задач: ${preview.records.length}. Выполненных: ${preview.completed}. Невыполненных: ${preview.records.length - preview.completed}. Без даты: ${preview.undated}. Создаваемые списки: ${newListTitles.join(", ") || "нет"}. Пустых записей: ${preview.emptyRecords}. Точные повторные вхождения: ${preview.duplicateOccurrences}. Диапазон дат: ${preview.firstDate ?? "нет"} — ${preview.lastDate ?? "нет"}.`}</p>
          <p>{previewWarning}</p>
          <ol>
            {preview.records.slice(0, 20).map((record) => (
              <li key={record.recordNumber}>
                {`Запись ${record.recordNumber}: ${record.date || `Без даты — ${record.listTitle}`} — ${record.title} (${record.completed ? "выполнена" : "не выполнена"})`}
              </li>
            ))}
          </ol>
          <p role="status">{progress}</p>
          <button
            type="button"
            disabled={writing}
            onClick={() => void onConfirm()}
          >
            Подтвердить импорт
          </button>
          <button
            ref={cancelRef}
            type="button"
            hidden={writing}
            onClick={close}
          >
            Отмена
          </button>
        </dialog>
      ) : null}
    </>
  );
}
