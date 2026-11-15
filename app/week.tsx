"use client";

import Link from "next/link";
import {
  startTransition,
  useEffect,
  useId,
  useOptimistic,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { addDays, localDate, weekNumber } from "../src/calendar";
import type { DayTask, TaskEdits } from "../src/planner";
import { createTask, deleteTask, saveTimeZone, updateTask } from "./actions";
import styles from "./week.module.css";

const dateRange = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
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
  children,
}: {
  label?: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className={styles.tool} aria-label={label} href={href}>
      {children}
    </Link>
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
  tasks: initialTasks,
  menu,
}: {
  today: string;
  dates: string[];
  tasks: DayTask[];
  menu: ReactNode;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [editing, setEditing] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const days = dates.map(localDate);
  const first = days[0];
  const last = days[6];
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
          <span className={styles.range}>
            {first.getMonth() === last.getMonth()
              ? `${first.getDate()}–${dateRange.format(last)}`
              : dateRange.formatRange(first, last)}
          </span>
        </div>
        <nav className={styles.tools} aria-label="Planner">
          <WeekLink
            label="Previous week"
            href={`/?week=${addDays(dates[0], -7)}`}
          >
            ‹
          </WeekLink>
          <WeekLink href="/">Today</WeekLink>
          <WeekLink label="Next week" href={`/?week=${addDays(dates[0], 7)}`}>
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
