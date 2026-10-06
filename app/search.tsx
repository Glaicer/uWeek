"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calendarDate } from "../src/calendar";
import { openTaskEditor, type TaskActions } from "../src/editor";
import type { Task } from "../src/model";
import type { PlannerStorage } from "../src/storage";
import "../src/search.css";

const unavailable =
  "Поиск недоступен. Проверьте доступ к хранилищу и повторите.";
const refreshFailure = "Не удалось обновить результаты. Повторите поиск.";
const editorFailure = "Редактор не открыт. Повторите действие.";
const goFailure = "Переход не сохранён. Повторите действие.";
const pageSize = 50;

interface SearchView {
  rows: { task: Task; place: string }[];
  count: number;
  pages: number;
  page: number;
}

interface SearchProps {
  storage: PlannerStorage;
  actions: TaskActions;
  refreshBoard: () => Promise<void>;
  goToTask: (task: Task) => Promise<void>;
}

export function Search(props: SearchProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-search-trigger=""
        onClick={() => setOpen(true)}
      >
        Поиск
      </button>
      {open ? <SearchDialog {...props} onClose={close} /> : null}
    </>
  );
}

function SearchDialog(props: SearchProps & { onClose: () => void }) {
  const { storage, actions, refreshBoard, goToTask, onClose } = props;
  const [query, setQuery] = useState("");
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [rerun, setRerun] = useState(0);
  const [status, setStatus] = useState("");
  const [view, setView] = useState<SearchView | null>(null);
  const revisionRef = useRef(0);
  const focusRequestRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    dialogRef.current?.close();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;
    if (!element.open) element.showModal();
    queryRef.current?.focus();
  }, []);

  useEffect(() => {
    const currentRevision = ++revisionRef.current;
    let alive = true;
    void (async () => {
      try {
        const snapshot = await storage.readSnapshot();
        if (!alive || revisionRef.current !== currentRevision) return;
        const text = query.toLowerCase();
        const today = calendarDate(new Date());
        const listOrder = new Map(
          snapshot.lists.map((list) => [list.id, list.order]),
        );
        const matches = snapshot.tasks
          .filter(
            (task) =>
              (includeCompleted || !task.completed) &&
              (!overdueOnly ||
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
        const pages = Math.max(1, Math.ceil(matches.length / pageSize));
        const safePage = Math.min(page, pages - 1);
        const start = safePage * pageSize;
        setView({
          rows: matches.slice(start, start + pageSize).map((task) => ({
            task,
            place:
              task.placement.date ??
              snapshot.lists.find((list) => list.id === task.placement.listId)!
                .title,
          })),
          count: matches.length,
          pages,
          page: safePage,
        });
        setStatus(
          matches.length ? `Найдено: ${matches.length}` : "Ничего не найдено",
        );
      } catch {
        if (!alive || revisionRef.current !== currentRevision) return;
        focusRequestRef.current = null;
        setStatus(unavailable);
      }
    })();
    return () => {
      alive = false;
    };
  }, [storage, query, includeCompleted, overdueOnly, page, rerun]);

  useEffect(() => {
    if (!view) return;
    const target = focusRequestRef.current;
    if (!target) return;
    focusRequestRef.current = null;
    const row = dialogRef.current?.querySelector<HTMLButtonElement>(
      `li[data-task-id="${target}"] button`,
    );
    (row ?? queryRef.current)?.focus();
  }, [view]);

  const openEditor = useCallback(
    (task: Task, trigger: HTMLButtonElement) => {
      openTaskEditor(task, trigger, actions, () => {
        void refreshBoard()
          .then(() => {
            focusRequestRef.current = task.id;
            setRerun((value) => value + 1);
          })
          .catch(() => setStatus(refreshFailure));
      }).catch(() => setStatus(editorFailure));
    },
    [actions, refreshBoard],
  );

  const go = useCallback(
    async (task: Task) => {
      try {
        await goToTask(task);
        close();
        document
          .querySelector<HTMLButtonElement>(
            `[data-task-id="${task.id}"] .task-title`,
          )
          ?.focus();
      } catch {
        setStatus(goFailure);
      }
    },
    [close, goToTask],
  );

  const appliedPage = view?.page ?? 0;

  return (
    <dialog
      ref={dialogRef}
      className="task-search"
      aria-labelledby="search-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <h2 id="search-title">Поиск задач</h2>
      <label>
        Поиск по тексту
        <input
          ref={queryRef}
          type="search"
          value={query}
          onChange={(event) => {
            setPage(0);
            setQuery(event.target.value);
          }}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          data-completed=""
          checked={includeCompleted}
          onChange={(event) => {
            setPage(0);
            setIncludeCompleted(event.target.checked);
          }}
        />
        Включать выполненные
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          data-overdue=""
          checked={overdueOnly}
          onChange={(event) => {
            setPage(0);
            setOverdueOnly(event.target.checked);
          }}
        />
        Просроченные
      </label>
      <p role="status" aria-live="polite">
        {status}
      </p>
      <ul aria-label="Результаты поиска">
        {(view?.rows ?? []).map((row) => (
          <li key={row.task.id} data-task-id={row.task.id}>
            <button
              type="button"
              onClick={(event) => openEditor(row.task, event.currentTarget)}
            >
              {row.task.title}
            </button>
            <p>
              {`${row.task.completed ? "Выполнена" : "Не выполнена"} — ${row.place}`}
            </p>
            <button type="button" onClick={() => void go(row.task)}>
              Перейти к задаче
            </button>
          </li>
        ))}
      </ul>
      <nav aria-label="Страницы результатов">
        <button
          type="button"
          data-previous=""
          disabled={!view || appliedPage === 0}
          onClick={() => setPage(appliedPage - 1)}
        >
          Предыдущая страница
        </button>
        <span data-page="">
          {view ? `Страница ${appliedPage + 1} из ${view.pages}` : ""}
        </span>
        <button
          type="button"
          data-next=""
          disabled={!view || appliedPage === view.pages - 1}
          onClick={() => setPage(appliedPage + 1)}
        >
          Следующая страница
        </button>
      </nav>
      <button type="button" data-close="" onClick={close}>
        Закрыть поиск
      </button>
    </dialog>
  );
}
