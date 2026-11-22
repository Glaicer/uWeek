"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useOptimistic,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  addDays,
  localDate,
  monthWeeks,
  weekNumber,
  type WeekStart,
} from "../src/calendar";
import { taskColorValues, type Placement, type TaskColor } from "../src/model";
import type { ChecklistItem, Scope, Task, TaskList } from "../src/planner";
import {
  monthEndChoice,
  type MonthEnd,
  type Repeat,
  type Weekday,
} from "../src/recurrence";
import {
  changesOf,
  monthEndOptions,
  placeOf,
  placed,
  startRepeat,
  type TaskDetails,
} from "../src/task-edits";
import {
  createList,
  createTask,
  deleteList,
  deleteTask,
  listTasks,
  moveList,
  renameList,
  saveTimeZone,
  updateTask,
} from "./actions";
import { startDrag } from "./drag";
import { Search } from "./search";
import styles from "./week.module.css";

const dateRange = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const monthName = new Intl.DateTimeFormat("en-GB", { month: "long" });
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
});
const pickerYears = 10;
const shortcutHints: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
};

function weekRange(week: string[]): string {
  const first = localDate(week[0]);
  const last = localDate(week[6]);
  // why: formatRange spaces the dash differently in Node and browser ICU, which breaks hydration
  if (first.getMonth() === last.getMonth())
    return `${first.getDate()}–${dateRange.format(last)}`;
  if (first.getFullYear() === last.getFullYear())
    return `${dayMonth.format(first)} – ${dateRange.format(last)}`;
  return `${dateRange.format(first)} – ${dateRange.format(last)}`;
}
const minRows = 5;
const saveFailed = "Couldn't save. Try again.";

function Band({
  heading,
  aside,
  place,
  panelOf,
  rows,
  className,
  current,
  children,
  onEmptyClick,
}: {
  heading: ReactNode;
  aside?: ReactNode;
  place: string;
  panelOf?: string;
  rows: number;
  className?: string;
  current?: boolean;
  children?: ReactNode[];
  onEmptyClick?: () => void;
}) {
  const id = useId();
  const filled = children?.length ?? 0;
  return (
    <section
      className={[styles.band, className, current && styles.today]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={id}
    >
      <div className={styles.gutter}>
        <h2
          className={styles.heading}
          id={id}
          aria-current={current ? "date" : undefined}
        >
          {heading}
        </h2>
      </div>
      {aside}
      <div
        className={styles.rows}
        data-zone="tasks"
        data-place={place}
        role={panelOf ? "tabpanel" : undefined}
        aria-labelledby={panelOf}
      >
        {children}
        {Array.from({ length: rows - filled }, (_, row) =>
          row === 0 && onEmptyClick ? (
            <button
              className={`${styles.row} ${styles.empty}`}
              key={row}
              type="button"
              aria-label="Add task"
              onClick={onEmptyClick}
            />
          ) : (
            <div
              className={`${styles.row} ${onEmptyClick ? styles.empty : ""}`}
              key={row}
              aria-hidden="true"
              onClick={onEmptyClick}
            />
          ),
        )}
      </div>
    </section>
  );
}

function useSave() {
  const [error, setError] = useState(false);
  async function save(work: () => Promise<void>): Promise<boolean> {
    try {
      await work();
      setError(false);
      return true;
    } catch {
      setError(true);
      return false;
    }
  }
  const alert = error ? (
    <span className={styles.error} role="alert">
      {saveFailed}
    </span>
  ) : null;
  return { save, alert };
}

function TitleInput({
  label,
  className = styles.input,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  label: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (reopen: boolean) => void;
  onCancel: () => void;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") onSubmit(true);
    if (event.key === "Escape") onCancel();
  }
  return (
    <input
      className={className}
      aria-label={label}
      value={value}
      autoFocus
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => onSubmit(false)}
    />
  );
}

interface Draft {
  id: string;
  placement: Placement;
  title: string;
  failed: boolean;
}

function NewTask({
  onSave,
  onClose,
}: {
  onSave: (title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  function submit(reopen: boolean) {
    const text = title.trim();
    if (text) {
      onSave(text);
      setTitle("");
    }
    if (!text || !reopen) onClose();
  }
  return (
    <div className={styles.row}>
      <TitleInput
        label="New task"
        value={title}
        onChange={setTitle}
        onSubmit={submit}
        onCancel={onClose}
      />
    </div>
  );
}

function DraftRow({
  draft,
  onRetry,
  onDiscard,
}: {
  draft: Draft;
  onRetry: (draft: Draft) => void;
  onDiscard: (draft: Draft) => void;
}) {
  return (
    <div className={`${styles.row} ${styles.draft}`}>
      <span className={styles.name}>{draft.title}</span>
      {draft.failed && (
        <span className={styles.error} role="alert">
          Couldn&apos;t save.{" "}
          <button
            className={styles.retry}
            type="button"
            onClick={() => onRetry(draft)}
          >
            Try again
          </button>
        </span>
      )}
      {draft.failed && (
        <button
          className={styles.action}
          type="button"
          aria-label={`Discard ${draft.title}`}
          onClick={() => onDiscard(draft)}
        >
          ×
        </button>
      )}
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.38 15.95c-.13.13-.22.29-.26.46l-1.08 4.34c-.09.34.01.7.26.95c.19.19.45.29.71.29c.08 0 .16 0 .24-.03l4.34-1.09c.18-.04.34-.13.46-.26L18.2 10.46l-4.67-4.67zM19.67 2.61c-.81-.81-2.14-.81-2.95 0l-1.78 1.78l4.67 4.67l1.78-1.78c.81-.81.81-2.13 0-2.95z"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19 4h-2V2h-2v2H9V2H7v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2M5 20V8h14V6v14z"
      />
      <path
        fill="currentColor"
        d="M7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"
      />
    </svg>
  );
}

function DetailsIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="m19.94 7.68l-.03-.09a.8.8 0 0 0-.2-.29l-5-5c-.09-.09-.19-.15-.29-.2l-.09-.03a.8.8 0 0 0-.26-.05c-.02 0-.04-.01-.06-.01H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-12s-.01-.04-.01-.06c0-.09-.02-.17-.05-.26ZM6 20V4h7v4c0 .55.45 1 1 1h4v11z"
      />
      <path fill="currentColor" d="M8 11h8v2H8zm0 4h8v2H8zm0-8h3v2H8z" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11 8.414V18h2V8.414l4.293 4.293l1.414-1.414L12 4.586l-6.707 6.707l1.414 1.414z"
      />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="m18.707 12.707l-1.414-1.414L13 15.586V6h-2v9.586l-4.293-4.293l-1.414 1.414L12 19.414z"
      />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.07 4.93c-.45-.45-.95-.86-1.48-1.22a9.6 9.6 0 0 0-1.7-.92c-.6-.25-1.24-.45-1.88-.58c-1.32-.27-2.71-.27-4.03 0c-.64.13-1.27.33-1.88.58a9.96 9.96 0 0 0-4.4 3.62a9.6 9.6 0 0 0-.92 1.7c-.25.6-.45 1.24-.58 1.88c-.13.66-.2 1.34-.2 2.01s.07 1.35.2 2.01c.13.64.33 1.27.58 1.88a9.96 9.96 0 0 0 3.62 4.4c.53.36 1.1.67 1.7.92s1.24.45 1.88.58c.66.13 1.34.2 2.01.2s1.35-.07 2.01-.2c.64-.13 1.27-.33 1.88-.58a9.96 9.96 0 0 0 4.4-3.62c.36-.53.67-1.1.92-1.7s.45-1.24.58-1.88c.13-.66.2-1.34.2-2.01h-2a7.85 7.85 0 0 1-.63 3.11c-.2.48-.45.93-.74 1.36c-.28.42-.61.82-.98 1.19c-.36.36-.76.69-1.18.98c-.43.29-.88.54-1.36.74s-.99.36-1.5.47a8 8 0 0 1-4.73-.47c-.48-.2-.93-.45-1.36-.74c-.42-.29-.82-.62-1.18-.98s-.69-.76-.98-1.19a8 8 0 0 1-.74-1.36c-.2-.48-.36-.99-.47-1.5A8 8 0 0 1 3.97 12a7.85 7.85 0 0 1 .63-3.11c.2-.48.45-.93.74-1.36c.29-.42.62-.82.98-1.18s.76-.69 1.18-.98c.43-.29.88-.54 1.36-.74s.99-.36 1.5-.47a8 8 0 0 1 4.73.47c.48.2.93.45 1.36.74c.42.29.82.62 1.18.98c.17.17.32.34.48.52L15.98 9h6V3l-2.45 2.45c-.15-.18-.31-.36-.48-.52Z"
      />
    </svg>
  );
}

const colorName = (color: TaskColor) => color[0].toUpperCase() + color.slice(1);

type AskScope = (
  action: "Change" | "Delete",
  title: string,
) => Promise<Scope | null>;

function useScopeQuestion(): [AskScope, ReactNode] {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const answer = useRef<((scope: Scope | null) => void) | null>(null);
  const [question, setQuestion] = useState<{
    action: "Change" | "Delete";
    title: string;
  }>();
  const ask: AskScope = (action, title) =>
    new Promise((resolve) => {
      answer.current = resolve;
      setQuestion({ action, title });
      dialog.current?.showModal();
    });
  function reply(scope: Scope | null) {
    const resolve = answer.current;
    answer.current = null;
    dialog.current?.close();
    resolve?.(scope);
  }
  return [
    ask,
    <dialog
      key="scope"
      className={styles.confirm}
      ref={dialog}
      aria-labelledby={id}
      onClose={() => reply(null)}
    >
      <p id={id}>
        {question?.action} “{question?.title}”: only this task or this and the
        following ones?
      </p>
      <div className={styles.confirmActions}>
        <button
          className={styles.tool}
          type="button"
          onClick={() => reply(null)}
        >
          Cancel
        </button>
        <button
          className={styles.tool}
          type="button"
          autoFocus
          onClick={() => reply("this")}
        >
          This task
        </button>
        <button
          className={`${styles.tool} ${question?.action === "Delete" ? styles.destructive : styles.primary}`}
          type="button"
          onClick={() => reply("following")}
        >
          This and following
        </button>
      </div>
    </dialog>,
  ];
}

function TaskRow({
  task,
  focusVisit,
  onChanged,
  onDeleted,
  onReload,
  onEdit,
  askScope,
}: {
  task: Task;
  focusVisit?: number;
  onChanged: (task: Task) => void;
  onDeleted: (id: string) => void;
  onReload: () => Promise<void>;
  onEdit: () => void;
  askScope: AskScope;
}) {
  const moverRef = useContext(Mover);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusVisit === undefined) return;
    button.current?.focus({ preventScroll: true });
    button.current?.scrollIntoView({ block: "center" });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = button.current?.parentElement?.animate(
      [{ backgroundColor: "#dcefe1" }, { backgroundColor: "transparent" }],
      { duration: 650, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [focusVisit]);
  const [completed, setCompleted] = useOptimistic(task.completed);
  const { save, alert } = useSave();
  const detailed = task.notes !== "" || task.checklist.length > 0;
  const missed =
    task.recurrence &&
    task.date !== undefined &&
    task.recurrence.occurrence !== task.date
      ? `from ${dayMonth.format(localDate(task.recurrence.occurrence))}`
      : undefined;

  async function remove() {
    const scope = task.recurrence
      ? await askScope("Delete", task.title)
      : "this";
    if (!scope) return;
    await save(async () => {
      await deleteTask(task.id, scope);
      if (scope === "following") await onReload();
      else onDeleted(task.id);
    });
  }

  return (
    <div
      className={`${styles.row} ${styles.task} ${styles.tinted} ${completed ? styles.done : ""}`}
      data-color={task.color ?? undefined}
      data-item={task.id}
      onPointerDown={(event) =>
        startDrag(event, {
          zone: "tasks",
          axis: "y",
          ghost: styles.ghost,
          onDrop: (zone, index) =>
            moverRef.current?.(task, zone.dataset.place!, index),
        })
      }
    >
      <button
        ref={button}
        className={styles.name}
        type="button"
        aria-pressed={completed}
        aria-current={focusVisit !== undefined ? "true" : undefined}
        aria-description={
          [
            task.color && colorName(task.color),
            detailed && "Has details",
            task.recurrence && "Repeats",
            missed,
          ]
            .filter(Boolean)
            .join(", ") || undefined
        }
        onClick={() =>
          startTransition(async () => {
            setCompleted(!completed);
            await save(async () =>
              onChanged(await updateTask(task.id, { completed: !completed })),
            );
          })
        }
      >
        {detailed && (
          <span className={styles.mark}>
            <DetailsIcon />
          </span>
        )}
        <span className={styles.label}>{task.title}</span>
        {task.recurrence && (
          <span className={`${styles.mark} ${styles.quiet}`} aria-hidden="true">
            <RepeatIcon />
          </span>
        )}
        {missed && (
          <span className={styles.missed} aria-hidden="true">
            ({missed})
          </span>
        )}
      </button>
      {alert}
      <button
        className={styles.action}
        type="button"
        aria-label={`Edit ${task.title}`}
        onClick={onEdit}
      >
        <EditIcon />
      </button>
      <button
        className={styles.action}
        type="button"
        aria-label={`Delete ${task.title}`}
        onClick={remove}
      >
        ×
      </button>
    </div>
  );
}

function Tool({
  label,
  primary,
  onClick,
  children,
}: {
  label?: string;
  primary?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={primary ? `${styles.tool} ${styles.primary}` : styles.tool}
      aria-label={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function WeekLink({
  label,
  href,
  shortcut,
  pressed,
  children,
}: {
  label?: string;
  href: string;
  shortcut: string;
  pressed: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      className={styles.tool}
      aria-label={label}
      href={href}
      aria-keyshortcuts={shortcut}
      title={`${label ?? children} (${shortcutHints[shortcut] ?? shortcut})`}
      data-pressed={pressed || undefined}
    >
      {children}
    </Link>
  );
}

function ChevronIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.293 9.293L12 13.586L7.707 9.293l-1.414 1.414L12 16.414l5.707-5.707z"
      />
    </svg>
  );
}

function focusSelected(list: HTMLElement) {
  const selected = list.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!selected) return;
  selected.focus({ preventScroll: true });
  list.scrollTop =
    selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
}

function Dropdown<Value extends string | number>({
  label,
  shortcut,
  value,
  options,
  list,
  onChange,
}: {
  label: string;
  shortcut?: string;
  value: Value;
  options: { value: Value; label: string }[];
  list: RefObject<HTMLDivElement | null>;
  onChange: (value: Value) => void;
}) {
  const id = useId();
  const anchor = `--dropdown${id}`;
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  function choose(next: Value) {
    list.current?.hidePopover();
    button.current?.focus();
    onChange(next);
  }

  function onKeyDown(event: KeyboardEvent) {
    const items = Array.from(
      list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
    const index = items.findIndex((item) => item === document.activeElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      items[Math.min(Math.max(index + step, 0), items.length - 1)].focus();
    }
    if ((event.key === "Enter" || event.key === " ") && index >= 0) {
      event.preventDefault();
      choose(options[index].value);
    }
  }

  return (
    <>
      <button
        ref={button}
        className={styles.dropdown}
        style={{ anchorName: anchor }}
        type="button"
        role="combobox"
        aria-label={label}
        aria-keyshortcuts={shortcut}
        title={shortcut ? `${label} (${shortcut})` : label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
      >
        {options.find((option) => option.value === value)?.label}
        <ChevronIcon />
      </button>
      <div
        ref={list}
        className={styles.options}
        style={{ positionAnchor: anchor }}
        id={id}
        popover="auto"
        role="listbox"
        aria-label={label}
        onKeyDown={onKeyDown}
        onToggle={(event) => {
          setOpen(event.newState === "open");
          // why: a list opened by its letter has no invoker to hand focus back to on Escape
          if (
            event.newState === "closed" &&
            document.activeElement === document.body
          )
            button.current?.focus();
          if (
            event.newState === "open" &&
            !event.currentTarget.contains(document.activeElement)
          )
            focusSelected(event.currentTarget);
        }}
      >
        {options.map((option) => (
          <div
            key={option.value}
            className={styles.option}
            role="option"
            tabIndex={-1}
            aria-selected={option.value === value}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </div>
        ))}
      </div>
    </>
  );
}

function GoTo({
  today,
  dates,
  weekStartsOn,
}: {
  today: string;
  dates: string[];
  weekStartsOn: WeekStart;
}) {
  const popover = useRef<HTMLDivElement>(null);
  const monthList = useRef<HTMLDivElement>(null);
  const yearList = useRef<HTMLDivElement>(null);
  const opening = useShortcut("KeyG", () => {
    popover.current?.showPopover();
    enterGrid();
  });
  const [year, setYear] = useState(Number(dates[3].slice(0, 4)));
  const [month, setMonth] = useState(Number(dates[3].slice(5, 7)));
  const thisYear = Number(today.slice(0, 4));
  const firstYear = Math.min(year, thisYear - pickerYears);
  const weeks = monthWeeks(year, month, weekStartsOn);
  const inMonth = (day: string) => Number(day.slice(5, 7)) === month;

  function weekRows(): HTMLElement[] {
    return Array.from(popover.current?.querySelectorAll("a") ?? []);
  }

  function enterGrid() {
    const rows = weekRows();
    (rows.find((row) => row.ariaCurrent === "true") ?? rows[0])?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const list = { KeyM: monthList, KeyY: yearList }[event.code]?.current;
    if (list) {
      event.preventDefault();
      if (!list.matches(":popover-open")) list.showPopover();
      focusSelected(list);
      return;
    }
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const rows = weekRows();
    const index = rows.findIndex((row) => row === document.activeElement);
    if (index < 0) enterGrid();
    else rows[Math.min(Math.max(index + step, 0), rows.length - 1)].focus();
  }

  return (
    <>
      <button
        className={`${styles.tool} ${styles.goToButton}`}
        aria-label="Go to week"
        aria-keyshortcuts="G"
        title="Go to week (G)"
        popoverTarget="go-to"
        type="button"
        data-pressed={opening || undefined}
      >
        <CalendarIcon />
      </button>
      <div
        className={styles.picker}
        id="go-to"
        popover="auto"
        ref={popover}
        role="dialog"
        aria-label="Go to week"
        onKeyDown={onKeyDown}
        onToggle={(event) => {
          if (
            event.target === event.currentTarget &&
            event.newState === "open" &&
            !event.currentTarget.contains(document.activeElement)
          )
            enterGrid();
        }}
      >
        <div className={styles.pickerHead}>
          <Dropdown
            label="Month"
            shortcut="M"
            list={monthList}
            value={month}
            options={Array.from({ length: 12 }, (_, index) => ({
              value: index + 1,
              label: monthName.format(new Date(2000, index, 1)),
            }))}
            onChange={setMonth}
          />
          <Dropdown
            label="Year"
            shortcut="Y"
            list={yearList}
            value={year}
            options={Array.from(
              {
                length: Math.max(year, thisYear + pickerYears) - firstYear + 1,
              },
              (_, index) => ({
                value: firstYear + index,
                label: String(firstYear + index),
              }),
            )}
            onChange={setYear}
          />
        </div>
        <div className={styles.calendarRow} aria-hidden="true">
          {weeks[0].map((day) => (
            <span className={styles.calendarWeekday} key={day}>
              {weekday.format(localDate(day)).slice(0, 2)}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <Link
            key={week[0]}
            className={styles.calendarRow}
            href={`/?week=${week[0]}`}
            aria-label={`Week ${weekNumber(week)}, ${weekRange(week)}`}
            aria-current={week[0] === dates[0] ? "true" : undefined}
            onClick={() => popover.current?.hidePopover()}
          >
            {week.map((day) => (
              <span
                key={day}
                className={[
                  styles.calendarDay,
                  !inMonth(day) && styles.outside,
                  day === today && styles.calendarToday,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {Number(day.slice(8))}
              </span>
            ))}
          </Link>
        ))}
      </div>
    </>
  );
}

function shortcutAllowed(event: globalThis.KeyboardEvent): boolean {
  const target = event.target;
  return !(
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest("input, textarea, select"))) ||
    document.querySelector(":popover-open, dialog[open]")
  );
}

// why: like a button, a shortcut shows its control pressed while held and acts on release; event.code keeps letters working in any keyboard layout
function useShortcut(code: string, action: () => void): boolean {
  const [pressed, setPressed] = useState(false);
  const act = useEffectEvent(action);
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.code !== code || !shortcutAllowed(event)) return;
      event.preventDefault();
      setPressed(true);
    }
    function onKeyUp(event: globalThis.KeyboardEvent) {
      if (event.code !== code || !pressed) return;
      setPressed(false);
      act();
    }
    const release = () => setPressed(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, [code, pressed]);
  return pressed;
}

const tabId = (list: TaskList) => `list-${list.id}`;

const SelectedList = createContext<[string | undefined, (id: string) => void]>([
  undefined,
  () => {},
]);

type Move = (task: Task, place: string, index: number) => void;
const Mover = createContext<RefObject<Move | null>>({ current: null });

export function KeepAcrossWeeks({ children }: { children: ReactNode }) {
  const selected = useState<string>();
  const moverRef = useRef<Move>(null);
  return (
    <SelectedList value={selected}>
      <Mover value={moverRef}>{children}</Mover>
    </SelectedList>
  );
}

function CogIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="m21.16 7.86l-1-1.73a1.997 1.997 0 0 0-2.73-.73l-.53.31c-.58-.46-1.22-.83-1.9-1.11V4c0-1.1-.9-2-2-2h-2c-1.1 0-2 .9-2 2v.6c-.67.28-1.31.66-1.9 1.11l-.53-.31c-.96-.55-2.18-.22-2.73.73l-1 1.73c-.55.96-.22 2.18.73 2.73l.5.29c-.05.37-.08.74-.08 1.11s.03.74.08 1.11l-.5.29c-.96.55-1.28 1.78-.73 2.73l1 1.73c.55.95 1.78 1.28 2.73.73l.53-.31c.58.46 1.22.83 1.9 1.11v.6c0 1.1.9 2 2 2h2c1.1 0 2-.9 2-2v-.6a8.7 8.7 0 0 0 1.9-1.11l.53.31c.96.55 2.18.22 2.73-.73l1-1.73c.55-.96.22-2.18-.73-2.73l-.5-.29c.05-.37.08-.74.08-1.11s-.03-.74-.08-1.11l.5-.29c.96-.55 1.28-1.78.73-2.73M12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4s4 1.79 4 4s-1.79 4-4 4"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" />
    </svg>
  );
}

function ListTabs({
  lists,
  selected,
  countOf,
  onSelect,
  onListsChange,
  onDeleted,
}: {
  lists: TaskList[];
  selected: TaskList;
  countOf: (list: TaskList) => number;
  onSelect: (list: TaskList) => void;
  onListsChange: (lists: TaskList[]) => void;
  onDeleted: (list: TaskList) => void;
}) {
  const tablist = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLDialogElement>(null);
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<TaskList | "new" | null>(null);
  const [deleting, setDeleting] = useState<TaskList | null>(null);
  const [title, setTitle] = useState("");
  const [refocus, setRefocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const { save, alert } = useSave();
  const refocusTab = () => setRefocus((n) => n + 1);
  const index = lists.indexOf(selected);
  const count = deleting ? countOf(deleting) : 0;

  useEffect(() => {
    if (refocus)
      tablist.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.focus();
  }, [refocus]);

  async function change(work: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    const saved = await save(work);
    setBusy(false);
    return saved;
  }

  function startEditing(target: TaskList | "new") {
    setTitle(target === "new" ? "" : target.title);
    setEditing(target);
  }

  function stopEditing() {
    setEditing(null);
    refocusTab();
  }

  async function submit() {
    if (!editing || busy) return;
    const text = title.trim();
    if (!text || (editing !== "new" && text === editing.title))
      return stopEditing();
    const saved = await change(async () => {
      if (editing === "new") {
        const list = await createList(text);
        onListsChange([...lists, list]);
        onSelect(list);
      } else {
        const list = await renameList(editing.id, text);
        onListsChange(lists.map((l) => (l.id === list.id ? list : l)));
      }
    });
    if (saved) stopEditing();
  }

  function askToDelete(list: TaskList) {
    setDeleting(list);
    confirm.current?.showModal();
  }

  function reorder(list: TaskList, index: number) {
    const rest = lists.filter((l) => l !== list);
    onListsChange([...rest.slice(0, index), list, ...rest.slice(index)]);
    change(async () => {
      try {
        await moveList(list.id, index);
      } catch (error) {
        onListsChange(lists);
        throw error;
      }
    });
  }

  async function remove() {
    confirm.current?.close();
    if (!deleting) return;
    await change(async () => {
      await deleteList(deleting.id);
      onDeleted(deleting);
    });
    refocusTab();
  }

  function onTabKeyDown(event: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = lists[Math.min(Math.max(index + step, 0), lists.length - 1)];
    onSelect(next);
    document.getElementById(tabId(next))?.focus();
  }

  const input = (label: string) => (
    <TitleInput
      key={label}
      label={label}
      className={`${styles.tab} ${styles.tabInput}`}
      value={title}
      onChange={setTitle}
      onSubmit={submit}
      onCancel={stopEditing}
    />
  );

  return (
    <div className={styles.tabBar}>
      <div
        className={`${styles.tabs} ${managing ? styles.managing : ""}`}
        ref={tablist}
        data-zone="lists"
        role="tablist"
        aria-label="Lists"
      >
        {lists.map((list) =>
          editing === list ? (
            input("List name")
          ) : (
            <span
              key={list.id}
              className={styles.tabItem}
              role="presentation"
              data-item={list.id}
              onPointerDown={(event) =>
                !busy &&
                startDrag(event, {
                  zone: "lists",
                  axis: "x",
                  ghost: styles.ghost,
                  onDrop: (_, index) => reorder(list, index),
                })
              }
            >
              <button
                className={styles.tab}
                id={tabId(list)}
                type="button"
                role="tab"
                title={list.title}
                aria-selected={list === selected}
                tabIndex={list === selected ? 0 : -1}
                disabled={busy}
                onClick={() => onSelect(list)}
                onKeyDown={onTabKeyDown}
              >
                {list.title}
              </button>
              {managing && (
                <>
                  <button
                    className={styles.action}
                    type="button"
                    aria-label={`Rename ${list.title}`}
                    disabled={busy}
                    onClick={() => startEditing(list)}
                  >
                    <EditIcon />
                  </button>
                  {lists.length > 1 && (
                    <button
                      className={`${styles.action} ${styles.remove}`}
                      type="button"
                      aria-label={`Delete ${list.title}`}
                      disabled={busy}
                      onClick={() => askToDelete(list)}
                    >
                      ×
                    </button>
                  )}
                </>
              )}
            </span>
          ),
        )}
        {editing === "new" && input("New list")}
      </div>
      <button
        className={styles.listTool}
        type="button"
        aria-label="New list"
        title="New list"
        disabled={busy}
        onClick={() => startEditing("new")}
      >
        <PlusIcon />
      </button>
      {alert}
      <button
        className={`${styles.listTool} ${styles.manage}`}
        type="button"
        aria-label="Edit lists"
        title="Edit lists"
        aria-pressed={managing}
        onClick={() => setManaging(!managing)}
      >
        <CogIcon />
      </button>
      <dialog
        className={styles.confirm}
        ref={confirm}
        aria-labelledby="delete-list"
        onClose={refocusTab}
      >
        <p id="delete-list">
          Delete “{deleting?.title}”
          {count > 0 && ` and its ${count} ${count === 1 ? "task" : "tasks"}`}?
        </p>
        <div className={styles.confirmActions}>
          <button
            className={styles.tool}
            type="button"
            autoFocus
            onClick={() => confirm.current?.close()}
          >
            Cancel
          </button>
          <button
            className={`${styles.tool} ${styles.destructive}`}
            type="button"
            onClick={remove}
          >
            Delete
          </button>
        </div>
      </dialog>
    </div>
  );
}

const fullWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
const frequencies = [
  { value: "never", label: "Never" },
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
] as const;
type Frequency = (typeof frequencies)[number]["value"];

function RepeatField({
  date,
  repeat,
  weekStartsOn,
  onChange,
}: {
  date: string;
  repeat: Repeat | null;
  weekStartsOn: WeekStart;
  onChange: (repeat: Repeat | null) => void;
}) {
  const frequencyList = useRef<HTMLDivElement>(null);
  const monthEndList = useRef<HTMLDivElement>(null);
  const shortMonths = monthEndOptions(date);
  const weekdays = Array.from(
    { length: 7 },
    (_, offset) => ((offset + weekStartsOn) % 7) as Weekday,
  );
  const shortMonthsLabel =
    monthEndChoice(date) === "31st" ? "In shorter months" : "Repeat on";

  return (
    <div className={`${styles.cardField} ${styles.repeatField}`}>
      <span className={styles.cardLabel}>Repeat</span>
      <div className={styles.repeatRow}>
        <Dropdown<Frequency>
          label="Repeat"
          list={frequencyList}
          value={repeat?.every ?? "never"}
          options={[...frequencies]}
          onChange={(next) =>
            onChange(next === "never" ? null : startRepeat(next, date, repeat))
          }
        />
        {repeat && (
          <label className={styles.every}>
            Every
            <input
              className={`${styles.dateInput} ${styles.interval}`}
              type="number"
              aria-label="Interval"
              min={1}
              max={999}
              value={repeat.interval}
              onChange={(event) => {
                const interval = Number(event.target.value);
                if (
                  Number.isInteger(interval) &&
                  interval >= 1 &&
                  interval <= 999
                )
                  onChange({ ...repeat, interval });
              }}
            />
            {repeat.interval === 1 ? repeat.every : `${repeat.every}s`}
          </label>
        )}
      </div>
      {repeat?.every === "week" && (
        <div className={styles.weekdays} role="group" aria-label="Weekdays">
          {weekdays.map((day) => {
            const name = fullWeekday.format(new Date(2026, 10, 15 + day));
            const on = repeat.weekdays.includes(day);
            return (
              <button
                key={day}
                className={styles.weekdayToggle}
                type="button"
                aria-label={name}
                aria-pressed={on}
                onClick={() => {
                  const next = on
                    ? repeat.weekdays.filter((other) => other !== day)
                    : [...repeat.weekdays, day].sort();
                  if (next.length) onChange({ ...repeat, weekdays: next });
                }}
              >
                {name.slice(0, 2)}
              </button>
            );
          })}
        </div>
      )}
      {repeat?.every === "month" && shortMonths.length > 0 && (
        <div className={styles.repeatRow}>
          <span className={styles.every}>{shortMonthsLabel}</span>
          <Dropdown<MonthEnd>
            label={shortMonthsLabel}
            list={monthEndList}
            value={repeat.monthEnd}
            options={shortMonths}
            onChange={(monthEnd) => onChange({ ...repeat, monthEnd })}
          />
        </div>
      )}
      {repeat && (
        <label className={`${styles.repeatRow} ${styles.every}`}>
          Until
          <input
            className={styles.dateInput}
            type="date"
            aria-label="Until"
            min={date}
            value={repeat.until ?? ""}
            onChange={(event) =>
              onChange({ ...repeat, until: event.target.value || null })
            }
          />
        </label>
      )}
    </div>
  );
}

function TaskCard({
  task,
  lists,
  today,
  weekStartsOn,
  askScope,
  onSaved,
  onDeleted,
  onReload,
  onClose,
}: {
  task: Task;
  lists: TaskList[];
  today: string;
  weekStartsOn: WeekStart;
  askScope: AskScope;
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
  onReload: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const placeList = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState<TaskDetails>(() => ({
    title: task.title,
    notes: task.notes,
    color: task.color,
    checklist: task.checklist,
    placement:
      task.date !== undefined ? { date: task.date } : { listId: task.listId },
    repeat: task.recurrence?.repeat ?? null,
  }));
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const { save, alert } = useSave();
  const dirty = newItem.trim() !== "" || changesOf(task, details) !== null;
  const withNewItem = (): TaskDetails =>
    newItem.trim()
      ? {
          ...details,
          checklist: [
            ...details.checklist,
            { id: crypto.randomUUID(), text: newItem, completed: false },
          ],
        }
      : details;

  useEffect(() => dialog.current?.showModal(), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (change: Partial<TaskDetails>) =>
    setDetails((details) => ({ ...details, ...change }));
  const setItems = (change: (items: ChecklistItem[]) => ChecklistItem[]) =>
    setDetails((details) => ({
      ...details,
      checklist: change(details.checklist),
    }));
  const changeItem = (id: string, change: Partial<ChecklistItem>) =>
    setItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  function moveItem(from: number, step: number) {
    setItems((items) => {
      const next = [...items];
      next.splice(from + step, 0, ...next.splice(from, 1));
      return next;
    });
  }

  function finish() {
    dialog.current?.close();
    onClose();
  }

  async function work(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    const done = await save(action);
    setBusy(false);
    if (done) finish();
  }

  async function close() {
    const change = changesOf(task, withNewItem());
    if (!change) return finish();
    const { edits } = change;
    const scope =
      task.recurrence && edits.repeat === undefined && change.seriesChanged
        ? await askScope("Change", task.title)
        : "this";
    if (!scope) return;
    work(async () => {
      const saved = await updateTask(task.id, edits, scope);
      if (scope === "following" || edits.repeat !== undefined) await onReload();
      else onSaved(saved);
    });
  }

  async function remove() {
    const scope = task.recurrence
      ? await askScope("Delete", task.title)
      : "this";
    if (!scope) return;
    work(async () => {
      await deleteTask(task.id, scope);
      if (scope === "following") await onReload();
      else onDeleted(task.id);
    });
  }

  function addItem() {
    if (!newItem.trim()) return;
    setDetails(withNewItem());
    setNewItem("");
  }

  function onKeyDown(event: KeyboardEvent) {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      document.querySelector(":popover-open")
    )
      return;
    event.preventDefault();
    close();
  }

  function onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  const place =
    details.placement.date !== undefined ? "date" : details.placement.listId;

  return (
    <dialog
      className={styles.card}
      ref={dialog}
      aria-label={task.title}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={onBackdropClick}
    >
      <div className={styles.cardBody}>
        <input
          className={styles.cardTitle}
          aria-label="Title"
          value={details.title}
          onChange={(event) => set({ title: event.target.value })}
        />
        <div className={styles.cardField}>
          <span className={styles.cardLabel}>Move to</span>
          <div className={styles.cardPlace}>
            <Dropdown
              label="Move to"
              list={placeList}
              value={place}
              options={[
                { value: "date", label: "Date" },
                ...lists.map((list) => ({ value: list.id, label: list.title })),
              ]}
              onChange={(next) =>
                set({
                  placement:
                    next === "date"
                      ? { date: task.date ?? today }
                      : { listId: next },
                })
              }
            />
            {details.placement.date && (
              <input
                className={styles.dateInput}
                type="date"
                aria-label="Date"
                required
                value={details.placement.date}
                onChange={(event) =>
                  event.target.value &&
                  set({ placement: { date: event.target.value } })
                }
              />
            )}
          </div>
        </div>
        {details.placement.date && (
          <RepeatField
            date={details.placement.date}
            repeat={details.repeat}
            weekStartsOn={weekStartsOn}
            onChange={(repeat) => set({ repeat })}
          />
        )}
        <fieldset className={styles.cardField}>
          <legend className={styles.cardLabel}>Color</legend>
          <div className={styles.colors}>
            {[null, ...taskColorValues].map((color) => (
              <input
                key={color ?? "none"}
                className={`${styles.swatch} ${styles.tinted}`}
                data-color={color ?? "none"}
                type="radio"
                name={`color-${task.id}`}
                aria-label={color ? colorName(color) : "No color"}
                checked={details.color === color}
                onChange={() => set({ color })}
              />
            ))}
          </div>
        </fieldset>
        <label className={styles.cardField}>
          <span className={styles.cardLabel}>Notes</span>
          <textarea
            className={styles.notes}
            value={details.notes}
            rows={3}
            onChange={(event) => set({ notes: event.target.value })}
          />
        </label>
        <div className={styles.cardField} role="group" aria-label="Checklist">
          <span className={styles.cardLabel} aria-hidden="true">
            Checklist
          </span>
          <ul className={styles.checklist}>
            {details.checklist.map((item, index) => (
              <li
                key={item.id}
                className={`${styles.checkItem} ${item.completed ? styles.done : ""}`}
              >
                <input
                  type="checkbox"
                  aria-labelledby={`item-${item.id}`}
                  checked={item.completed}
                  onChange={(event) =>
                    changeItem(item.id, { completed: event.target.checked })
                  }
                />
                <input
                  className={styles.checkText}
                  id={`item-${item.id}`}
                  aria-label="Checklist item"
                  value={item.text}
                  onChange={(event) =>
                    changeItem(item.id, { text: event.target.value })
                  }
                />
                <button
                  className={styles.action}
                  type="button"
                  aria-label={`Move ${item.text} up`}
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                >
                  <UpIcon />
                </button>
                <button
                  className={styles.action}
                  type="button"
                  aria-label={`Move ${item.text} down`}
                  disabled={index === details.checklist.length - 1}
                  onClick={() => moveItem(index, 1)}
                >
                  <DownIcon />
                </button>
                <button
                  className={`${styles.action} ${styles.remove}`}
                  type="button"
                  aria-label={`Delete ${item.text}`}
                  onClick={() =>
                    setItems((items) => items.filter((i) => i.id !== item.id))
                  }
                >
                  ×
                </button>
              </li>
            ))}
            <li className={styles.checkItem}>
              <PlusIcon />
              <input
                className={styles.checkText}
                aria-label="New item"
                placeholder="Add item"
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addItem()}
              />
            </li>
          </ul>
        </div>
        <div className={styles.cardFooter}>
          <button
            className={`${styles.tool} ${styles.deleteTask}`}
            type="button"
            disabled={busy}
            onClick={remove}
          >
            Delete task
          </button>
          {alert}
          <button
            className={`${styles.tool} ${styles.primary}`}
            type="button"
            disabled={busy}
            onClick={close}
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function DetectTimeZone() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    saveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() =>
      setFailed(true),
    );
  }, []);
  return failed ? (
    <p className={styles.loadError} role="alert">
      Couldn&apos;t load your week. Reload the page.
    </p>
  ) : null;
}

export function Week({
  today,
  dates,
  weekStartsOn,
  lists: initialLists,
  tasks: initialTasks,
  focusId,
  menu,
}: {
  today: string;
  dates: string[];
  weekStartsOn: WeekStart;
  lists: TaskList[];
  tasks: Task[];
  focusId?: string;
  menu: ReactNode;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [lists, setLists] = useState(initialLists);
  const [focus, setFocus] = useState({ id: focusId, visit: 0 });
  const [rememberedId, rememberId] = useContext(SelectedList);
  const [selectedId, setSelectedId] = useState(
    initialTasks.find((task) => task.id === focusId)?.listId ?? rememberedId,
  );
  const selected = lists.find((list) => list.id === selectedId) ?? lists[0];
  useEffect(() => rememberId(selected.id), [rememberId, selected.id]);
  const [editing, setEditing] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = tasks.find((task) => task.id === openId);
  const previousWeek = `/?week=${addDays(dates[0], -7)}`;
  const nextWeek = `/?week=${addDays(dates[0], 7)}`;
  const router = useRouter();
  const back = useShortcut("ArrowLeft", () => router.push(previousWeek));
  const forward = useShortcut("ArrowRight", () => router.push(nextWeek));
  const toToday = useShortcut("KeyT", () => router.push("/"));

  const days = dates.map(localDate);
  const places = [...dates, selected.id];
  const byPlace = places.map((place) =>
    tasks.filter((task) => placeOf(task) === place),
  );
  const draftsByPlace = places.map((place) =>
    drafts.filter((draft) => placeOf(draft.placement) === place),
  );
  const counts = byPlace.map(
    (place, index) => place.length + draftsByPlace[index].length,
  );
  // why: the tab bar takes the Someday band's first row
  counts[7] += 1;
  // why: band i faces band i+4 across the spine (Mon↔Fri … Thu↔Someday, or Sun↔Thu … Wed↔Someday) and keeps the same rows so the rules line up
  const rows = counts.map((count, band) =>
    Math.max(minRows, Math.max(count, counts[(band + 4) % 8]) + 1),
  );

  const open = (place: string) =>
    setEditing((places) =>
      places.includes(place) ? places : [...places, place],
    );
  const close = (place: string) =>
    setEditing((places) => places.filter((open) => open !== place));
  const replace = (task: Task) =>
    setTasks((tasks) => tasks.map((t) => (t.id === task.id ? task : t)));
  const remove = (id: string) =>
    setTasks((tasks) => tasks.filter((t) => t.id !== id));
  const { save, alert } = useSave();
  const [askScope, scopeQuestion] = useScopeQuestion();
  async function reload() {
    const fresh = await listTasks(dates[0], dates[6]);
    setTasks((tasks) => [
      ...tasks.filter((task) => task.date === undefined),
      ...fresh,
    ]);
  }
  const moverRef = useContext(Mover);
  function move(task: Task, place: string, index: number) {
    const placement: Placement = dates.includes(place)
      ? { date: place }
      : { listId: place };
    const home = tasks
      .filter((other) => placeOf(other) === placeOf(task))
      .indexOf(task);
    setTasks((tasks) =>
      placed(
        tasks,
        { ...task, date: undefined, listId: undefined, ...placement },
        index,
      ),
    );
    save(async () => {
      try {
        await updateTask(task.id, { placement: { ...placement, index } });
      } catch (error) {
        setTasks((tasks) => placed(tasks, task, home));
        throw error;
      }
    });
  }
  useEffect(() => {
    moverRef.current = move;
  });
  const discard = (draft: Draft) =>
    setDrafts((drafts) => drafts.filter((d) => d.id !== draft.id));
  async function saveDraft(draft: Draft) {
    setDrafts((drafts) => [
      ...drafts.filter((d) => d.id !== draft.id),
      { ...draft, failed: false },
    ]);
    try {
      const task = await createTask(draft.title, draft.placement);
      setTasks((tasks) => [...tasks, task]);
      setDrafts((drafts) => drafts.filter((d) => d.id !== draft.id));
    } catch {
      setDrafts((drafts) =>
        drafts.map((d) => (d.id === draft.id ? { ...d, failed: true } : d)),
      );
    }
  }

  function rowsOf(index: number, placement: Placement): ReactNode[] {
    const key = placeOf(placement);
    const children = [
      ...byPlace[index].map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          focusVisit={task.id === focus.id ? focus.visit : undefined}
          onChanged={replace}
          onDeleted={remove}
          onReload={reload}
          onEdit={() => setOpenId(task.id)}
          askScope={askScope}
        />
      )),
      ...draftsByPlace[index].map((draft) => (
        <DraftRow
          key={draft.id}
          draft={draft}
          onRetry={saveDraft}
          onDiscard={discard}
        />
      )),
    ];
    if (editing.includes(key))
      children.push(
        <NewTask
          key="new"
          onSave={(title) =>
            saveDraft({
              id: crypto.randomUUID(),
              placement,
              title,
              failed: false,
            })
          }
          onClose={() => close(key)}
        />,
      );
    return children;
  }

  function deleted(list: TaskList) {
    const rest = lists.filter((l) => l !== list);
    setLists(rest);
    setTasks((tasks) => tasks.filter((task) => task.listId !== list.id));
    if (list === selected)
      setSelectedId(rest[Math.max(lists.indexOf(list) - 1, 0)].id);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.title}>
          <h1 className={styles.week}>Week {weekNumber(dates)}</h1>
          <span className={styles.range}>{weekRange(dates)}</span>
          {alert}
        </div>
        <nav className={styles.tools} aria-label="Planner">
          <WeekLink
            label="Previous week"
            href={previousWeek}
            shortcut="ArrowLeft"
            pressed={back}
          >
            ‹
          </WeekLink>
          <GoTo today={today} dates={dates} weekStartsOn={weekStartsOn} />
          <WeekLink href="/" shortcut="T" pressed={toToday}>
            Today
          </WeekLink>
          <WeekLink
            label="Next week"
            href={nextWeek}
            shortcut="ArrowRight"
            pressed={forward}
          >
            ›
          </WeekLink>
          <Search
            onSelect={(id) => {
              const target = tasks.find(
                (task) => task.id === id || task.recurrence?.seriesId === id,
              );
              if (!target) return;
              if (target.listId) setSelectedId(target.listId);
              setFocus((focus) => ({ id: target.id, visit: focus.visit + 1 }));
            }}
          />
          {menu}
          <Tool
            primary
            onClick={() => open(dates.includes(today) ? today : dates[0])}
          >
            New task
          </Tool>
        </nav>
      </header>
      <div
        className={`${styles.flip} ${styles.previous}`}
        data-drag-press
        aria-hidden="true"
        onClick={() => router.push(previousWeek, { scroll: false })}
      >
        ‹
      </div>
      <div
        className={`${styles.flip} ${styles.next}`}
        data-drag-press
        aria-hidden="true"
        onClick={() => router.push(nextWeek, { scroll: false })}
      >
        ›
      </div>
      <div className={styles.spread}>
        {days.map((date, index) => {
          const key = dates[index];
          const isToday = key === today;
          return (
            <Band
              key={key}
              place={key}
              current={isToday}
              rows={rows[index]}
              onEmptyClick={() => open(key)}
              heading={
                <>
                  <span className={styles.number}>
                    {String(date.getDate()).padStart(2, "0")}
                  </span>{" "}
                  <span className={styles.weekday}>
                    {isToday ? "Today" : weekday.format(date)}
                  </span>
                </>
              }
            >
              {rowsOf(index, { date: key })}
            </Band>
          );
        })}
        <Band
          className={styles.someday}
          place={selected.id}
          rows={rows[7] - 1}
          panelOf={tabId(selected)}
          onEmptyClick={() => open(selected.id)}
          heading={<span className={styles.weekday}>Someday</span>}
          aside={
            <ListTabs
              lists={lists}
              selected={selected}
              countOf={(list) =>
                tasks.filter((task) => task.listId === list.id).length +
                drafts.filter((draft) => draft.placement.listId === list.id)
                  .length
              }
              onSelect={(list) => setSelectedId(list.id)}
              onListsChange={setLists}
              onDeleted={deleted}
            />
          }
        >
          {rowsOf(7, { listId: selected.id })}
        </Band>
      </div>
      {opened && (
        <TaskCard
          key={opened.id}
          task={opened}
          lists={lists}
          today={today}
          weekStartsOn={weekStartsOn}
          askScope={askScope}
          onSaved={replace}
          onDeleted={remove}
          onReload={reload}
          onClose={() => setOpenId(null)}
        />
      )}
      {scopeQuestion}
    </main>
  );
}
