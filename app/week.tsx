"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useId,
  useOptimistic,
  useRef,
  useState,
  type KeyboardEvent,
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
import type { DayTask, TaskEdits } from "../src/planner";
import { createTask, deleteTask, saveTimeZone, updateTask } from "./actions";
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
  rows,
  className,
  current,
  children,
  onEmptyClick,
}: {
  heading: ReactNode;
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
      <h2
        className={styles.gutter}
        id={id}
        aria-current={current ? "date" : undefined}
      >
        {heading}
      </h2>
      <div className={styles.rows}>
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
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  label: string;
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
      className={styles.input}
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
  date: string;
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

function TaskRow({
  task,
  onChanged,
  onDeleted,
}: {
  task: DayTask;
  onChanged: (task: DayTask) => void;
  onDeleted: (id: string) => void;
}) {
  const [renamed, setRenamed] = useState<string | null>(null);
  const [completed, setCompleted] = useOptimistic(task.completed);
  const { save, alert } = useSave();
  const change = (edits: TaskEdits) =>
    save(async () => onChanged(await updateTask(task.id, edits)));

  async function rename() {
    if (renamed === null) return;
    const title = renamed.trim();
    if (!title || title === task.title || (await change({ title })))
      setRenamed(null);
  }

  return (
    <div
      className={`${styles.row} ${styles.task} ${completed ? styles.done : ""}`}
    >
      {renamed === null ? (
        <button
          className={styles.name}
          type="button"
          aria-pressed={completed}
          onClick={() =>
            startTransition(async () => {
              setCompleted(!completed);
              await change({ completed: !completed });
            })
          }
        >
          {task.title}
        </button>
      ) : (
        <TitleInput
          label="Task title"
          value={renamed}
          onChange={setRenamed}
          onSubmit={rename}
          onCancel={() => setRenamed(null)}
        />
      )}
      {alert}
      <button
        className={styles.action}
        type="button"
        aria-label={`Edit ${task.title}`}
        onClick={() => setRenamed(task.title)}
      >
        <EditIcon />
      </button>
      <button
        className={styles.action}
        type="button"
        aria-label={`Delete ${task.title}`}
        onClick={() =>
          save(async () => {
            await deleteTask(task.id);
            onDeleted(task.id);
          })
        }
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

function Dropdown({
  label,
  shortcut,
  value,
  options,
  list,
  onChange,
}: {
  label: string;
  shortcut: string;
  value: number;
  options: { value: number; label: string }[];
  list: RefObject<HTMLDivElement | null>;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const anchor = `--dropdown${id}`;
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  function choose(next: number) {
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
        title={`${label} (${shortcut})`}
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
    document.querySelector(":popover-open")
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
  tasks: initialTasks,
  menu,
}: {
  today: string;
  dates: string[];
  weekStartsOn: WeekStart;
  tasks: DayTask[];
  menu: ReactNode;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [editing, setEditing] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const previousWeek = `/?week=${addDays(dates[0], -7)}`;
  const nextWeek = `/?week=${addDays(dates[0], 7)}`;
  const router = useRouter();
  const back = useShortcut("ArrowLeft", () => router.push(previousWeek));
  const forward = useShortcut("ArrowRight", () => router.push(nextWeek));
  const toToday = useShortcut("KeyT", () => router.push("/"));

  const days = dates.map(localDate);
  const byDay = dates.map((date) => tasks.filter((task) => task.date === date));
  const draftsByDay = dates.map((date) =>
    drafts.filter((draft) => draft.date === date),
  );
  const counts = [
    ...byDay.map((day, index) => day.length + draftsByDay[index].length),
    0,
  ];
  // why: band i faces band i+4 across the spine (Mon↔Fri … Thu↔Someday, or Sun↔Thu … Wed↔Someday) and keeps the same rows so the rules line up
  const rows = counts.map((count, band) =>
    Math.max(minRows, Math.max(count, counts[(band + 4) % 8]) + 1),
  );

  const open = (date: string) =>
    setEditing((dates) => (dates.includes(date) ? dates : [...dates, date]));
  const close = (date: string) =>
    setEditing((dates) => dates.filter((open) => open !== date));
  const replace = (task: DayTask) =>
    setTasks((tasks) => tasks.map((t) => (t.id === task.id ? task : t)));
  const remove = (id: string) =>
    setTasks((tasks) => tasks.filter((t) => t.id !== id));
  const discard = (draft: Draft) =>
    setDrafts((drafts) => drafts.filter((d) => d.id !== draft.id));
  async function saveDraft(draft: Draft) {
    setDrafts((drafts) => [
      ...drafts.filter((d) => d.id !== draft.id),
      { ...draft, failed: false },
    ]);
    try {
      const task = await createTask(draft.title, draft.date);
      setTasks((tasks) => [...tasks, task]);
      setDrafts((drafts) => drafts.filter((d) => d.id !== draft.id));
    } catch {
      setDrafts((drafts) =>
        drafts.map((d) => (d.id === draft.id ? { ...d, failed: true } : d)),
      );
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.title}>
          <h1 className={styles.week}>Week {weekNumber(dates)}</h1>
          <span className={styles.range}>{weekRange(dates)}</span>
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
          {menu}
          <Tool
            primary
            onClick={() => open(dates.includes(today) ? today : dates[0])}
          >
            New task
          </Tool>
        </nav>
      </header>
      <div className={styles.spread}>
        {days.map((date, index) => {
          const key = dates[index];
          const isToday = key === today;
          const children = [
            ...byDay[index].map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onChanged={replace}
                onDeleted={remove}
              />
            )),
            ...draftsByDay[index].map((draft) => (
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
                    date: key,
                    title,
                    failed: false,
                  })
                }
                onClose={() => close(key)}
              />,
            );
          return (
            <Band
              key={key}
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
              {children}
            </Band>
          );
        })}
        <Band
          className={styles.someday}
          rows={rows[7]}
          heading={<span className={styles.weekday}>Someday</span>}
        />
      </div>
    </main>
  );
}
