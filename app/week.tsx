"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { calendarDate, currentWeek, isoWeek, localDate } from "../src/calendar";
import styles from "./week.module.css";

const noSubscription = () => () => {};
const dateRange = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const emptyRows = 5;

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
  className,
  current,
}: {
  heading: ReactNode;
  className?: string;
  current?: boolean;
}) {
  const id = useId();
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
      <div className={styles.rows} aria-hidden="true">
        {Array.from({ length: emptyRows }, (_, row) => (
          <div className={styles.row} key={row} />
        ))}
      </div>
    </section>
  );
}

function Day({ date, today }: { date: Date; today: boolean }) {
  return (
    <Band
      current={today}
      heading={
        <>
          <span className={styles.number}>
            {String(date.getDate()).padStart(2, "0")}
          </span>{" "}
          <span className={styles.weekday}>
            {today ? "Today" : weekday.format(date)}
          </span>
        </>
      }
    />
  );
}

function Tool({
  label,
  primary,
  children,
}: {
  label?: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={primary ? `${styles.tool} ${styles.primary}` : styles.tool}
      aria-label={label}
      type="button"
      disabled
    >
      {children}
    </button>
  );
}

export function Week({ menu }: { menu: ReactNode }) {
  const today = useToday();
  if (!today) return null;
  const days = currentWeek(today);
  const [monday, , , thursday, , , sunday] = days;
  const isToday = (date: Date) => calendarDate(date) === calendarDate(today);
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
          {/* shortcut: week navigation arrives with ticket 04, New task with ticket 03 */}
          <Tool label="Previous week">‹</Tool>
          <Tool>Today</Tool>
          <Tool label="Next week">›</Tool>
          {menu}
          <Tool primary>New task</Tool>
        </nav>
      </header>
      <div className={styles.spread}>
        {days.map((date) => (
          <Day key={date.getTime()} date={date} today={isToday(date)} />
        ))}
        <Band
          className={styles.someday}
          heading={<span className={styles.weekday}>Someday</span>}
        />
      </div>
    </main>
  );
}
