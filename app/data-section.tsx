"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createBackup, prepareBackup, type BackupV1 } from "../src/backup";
import type { PlannerStorage } from "../src/storage";
import { CsvImport } from "./csv-import";
import { trapTab } from "./trap-tab";

const warning =
  "Данные хранятся только в этом origin (адресе сайта) и профиле браузера. Очистка данных сайта, удаление профиля и приватный режим могут удалить план. Для переноса между устройствами скачайте и вручную перенесите копию. JSON содержит личные данные открытым текстом, без шифрования. Постоянное хранение не заменяет резервную копию.";

const restoreFailure =
  "Восстановление не сохранено. База не изменена. Повторите попытку.";
const restoredStatus = "Копия восстановлена. Открыта текущая неделя.";
const restoredRefreshFailure =
  "Копия восстановлена, но доска не обновилась. Перезагрузите страницу.";
const writeProgress = "Замена данных…";
const exportFailure = "Не удалось скачать копию. Повторите попытку.";
const currentCopyFailure = "Не удалось скачать текущую копию.";
const checkFailure = "Не удалось проверить копию";
const persistUnsupported = "Постоянное хранение не поддерживается браузером.";
const persistAllowed =
  "Постоянное хранение разрешено. Резервная копия всё равно необходима.";
const persistDenied =
  "Постоянное хранение не разрешено. Работа доступна; сохраняйте резервные копии.";
const persistError =
  "Не удалось запросить постоянное хранение. Работа доступна; сохраняйте резервные копии.";

const noopSubscribe = () => () => {};

export interface DataSectionProps {
  storage: PlannerStorage;
  refresh: () => Promise<void>;
  restored: () => Promise<void>;
  showStatus: (text: string) => void;
}

export function DataSection({
  storage,
  refresh,
  restored,
  showStatus,
}: DataSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const writingRef = useRef(false);
  const returnFocusRef = useRef(false);
  const [pending, setPending] = useState<BackupV1 | null>(null);
  const [writing, setWriting] = useState(false);
  const [progress, setProgress] = useState("");
  const [persistResult, setPersistResult] = useState("");
  const [persistBusy, setPersistBusy] = useState(false);
  const persistSupported = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(navigator.storage?.persist),
    () => true,
  );

  const download = useCallback(async () => {
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
  }, [storage]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!pending || !dialog || dialog.open) return;
    dialog.showModal();
    cancelRef.current?.focus();
  }, [pending]);

  useEffect(() => {
    if (pending || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    inputRef.current?.focus();
  });

  const resetFile = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.disabled = false;
    input.value = "";
  }, []);

  const cancel = useCallback(() => {
    returnFocusRef.current = true;
    setPending(null);
    setProgress("");
    resetFile();
  }, [resetFile]);

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    try {
      const backup = await prepareBackup(file);
      setProgress("");
      setPending(backup);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : checkFailure);
      input.disabled = false;
      input.value = "";
    }
  };

  const confirm = async () => {
    if (writingRef.current || !pending) return;
    writingRef.current = true;
    setWriting(true);
    setProgress(writeProgress);
    try {
      await storage.restoreBackup(pending);
    } catch {
      writingRef.current = false;
      setWriting(false);
      setProgress(restoreFailure);
      return;
    }
    writingRef.current = false;
    setWriting(false);
    returnFocusRef.current = true;
    setPending(null);
    setProgress("");
    resetFile();
    try {
      await restored();
      showStatus(restoredStatus);
    } catch {
      showStatus(restoredRefreshFailure);
    }
  };

  const requestPersistence = async () => {
    setPersistBusy(true);
    try {
      const granted = await navigator.storage.persist();
      setPersistResult(granted ? persistAllowed : persistDenied);
    } catch {
      setPersistResult(persistError);
    } finally {
      setPersistBusy(false);
    }
  };

  return (
    <section aria-label="Данные">
      <h2>Данные</h2>
      <p>{warning}</p>
      <CsvImport storage={storage} refresh={refresh} showStatus={showStatus} />
      <button
        type="button"
        onClick={() =>
          void download().catch((error) => {
            showStatus(error instanceof Error ? error.message : exportFailure);
          })
        }
      >
        Скачать резервную копию
      </button>
      <label>
        Восстановить JSON
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          onChange={(event) => void onFile(event.currentTarget)}
        />
      </label>
      <button
        type="button"
        disabled={persistBusy || !persistSupported}
        onClick={() => void requestPersistence()}
      >
        Запросить постоянное хранение
      </button>
      <p aria-live="polite" aria-label="Результат постоянного хранения">
        {!persistSupported ? persistUnsupported : persistResult}
      </p>
      {pending && (
        <dialog
          ref={dialogRef}
          onKeyDown={trapTab}
          aria-label="Восстановление копии"
          onCancel={(event) => {
            event.preventDefault();
            if (!writingRef.current) cancel();
          }}
        >
          <p>{`Задач: ${pending.tasks.length}. Списков: ${pending.lists.length}. Все текущие данные, настройки и история импорта будут полностью заменены, не объединены. Откроется текущая неделя.`}</p>
          <p role="status">{progress}</p>
          <button
            type="button"
            disabled={writing}
            onClick={() =>
              void download().catch((error) => {
                setProgress(
                  error instanceof Error ? error.message : currentCopyFailure,
                );
              })
            }
          >
            Скачать текущую копию
          </button>
          <button
            type="button"
            disabled={writing}
            onClick={() => void confirm()}
          >
            Заменить все данные
          </button>
          <button
            ref={cancelRef}
            type="button"
            disabled={writing}
            onClick={cancel}
          >
            Отмена
          </button>
        </dialog>
      )}
    </section>
  );
}
