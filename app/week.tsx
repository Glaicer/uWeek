"use client";

import {
  startTransition,
  useEffect,
  useId,
  useOptimistic,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { calendarDate, currentWeek, isoWeek, localDate } from "../src/calendar";
import type { DayTask, TaskEdits } from "../src/planner";
import { createTask, deleteTask, listTasks, updateTask } from "./actions";
import styles from "./week.module.css";

const noSubscription = () => () => {};
const dateRange = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const minRows = 5;
const saveFailed = "Couldn't save. Try again.";

// shortcut: "today" comes from the browser clock; ticket 04 stores the user's time zone and renders the week on the server
function useToday(): Date | null {
  const today = useSyncExternalStore(
    noSubscription,
    () => calendarDate(new Date()),
    () => null,
  );
  return today === null ? null : localDate(today);
}

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
    <div className={`${styles.row} ${styles.newTask}`}>
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
      <span className={styles.check} />
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
          className={styles.delete}
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
      <input
        className={styles.check}
        type="checkbox"
        aria-label={task.title}
        checked={completed}
        onChange={() =>
          startTransition(async () => {
            setCompleted(!completed);
            await change({ completed: !completed });
          })
        }
      />
      {renamed === null ? (
        <button
          className={styles.name}
          type="button"
          onClick={() => setRenamed(task.title)}
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
        className={styles.delete}
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
  disabled,
  onClick,
  children,
}: {
  label?: string;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={primary ? `${styles.tool} ${styles.primary}` : styles.tool}
      aria-label={label}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function useWeekTasks(from: string | null, to: string | null) {
  const [loaded, setLoaded] = useState<DayTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!from || !to) return;
    let current = true;
    listTasks(from, to).then(
      (tasks) => current && setLoaded(tasks),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [from, to]);
  return [loaded, setLoaded, failed] as const;
}

export function Week({ menu }: { menu: ReactNode }) {
  const today = useToday();
  const days = today ? currentWeek(today) : [];
  const dates = days.map(calendarDate);
  const [tasks, setTasks, loadFailed] = useWeekTasks(
    dates[0] ?? null,
    dates[6] ?? null,
  );
  const [editing, setEditing] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  if (!today) return null;

  const [monday, , , thursday, , , sunday] = days;
  const todayDate = calendarDate(today);
  const ready = tasks !== null;
  const byDay = dates.map((date) =>
    (tasks ?? []).filter((task) => task.date === date),
  );
  const draftsByDay = dates.map((date) =>
    drafts.filter((draft) => draft.date === date),
  );
  const counts = [
    ...byDay.map((day, index) => day.length + draftsByDay[index].length),
    0,
  ];
  // why: bands facing each other across the spine (Mon↔Fri … Thu↔Someday) keep the same rows so the rules line up
  const rows = counts.map((count, band) =>
    Math.max(minRows, Math.max(count, counts[(band + 4) % 8]) + 1),
  );

  const open = (date: string) =>
    setEditing((dates) => (dates.includes(date) ? dates : [...dates, date]));
  const close = (date: string) =>
    setEditing((dates) => dates.filter((open) => open !== date));
  const replace = (task: DayTask) =>
    setTasks((tasks) => tasks!.map((t) => (t.id === task.id ? task : t)));
  const remove = (id: string) =>
    setTasks((tasks) => tasks!.filter((t) => t.id !== id));
  const discard = (draft: Draft) =>
    setDrafts((drafts) => drafts.filter((d) => d.id !== draft.id));
  async function saveDraft(draft: Draft) {
    setDrafts((drafts) => [
      ...drafts.filter((d) => d.id !== draft.id),
      { ...draft, failed: false },
    ]);
    try {
      const task = await createTask(draft.title, draft.date);
      setTasks((tasks) => [...tasks!, task]);
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
          <h1 className={styles.week}>Week {isoWeek(thursday)}</h1>
          <span className={styles.range}>
            {monday.getMonth() === sunday.getMonth()
              ? `${monday.getDate()}–${dateRange.format(sunday)}`
              : dateRange.formatRange(monday, sunday)}
          </span>
        </div>
        <nav className={styles.tools} aria-label="Planner">
          {/* shortcut: week navigation arrives with ticket 04 */}
          <Tool label="Previous week" disabled>
            ‹
          </Tool>
          <Tool disabled>Today</Tool>
          <Tool label="Next week" disabled>
            ›
          </Tool>
          {menu}
          <Tool primary disabled={!ready} onClick={() => open(todayDate)}>
            New task
          </Tool>
        </nav>
      </header>
      {loadFailed && (
        <p className={styles.loadError} role="alert">
          Couldn&apos;t load your tasks. Reload the page.
        </p>
      )}
      <div className={styles.spread}>
        {days.map((date, index) => {
          const key = dates[index];
          const isToday = key === todayDate;
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
              onEmptyClick={ready ? () => open(key) : undefined}
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
