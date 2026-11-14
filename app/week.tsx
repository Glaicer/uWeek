"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { calendarDate, currentWeek, isoWeek, localDate } from "../src/calendar";
import styles from "./week.module.css";

const noSubscription = () => () => {};
const monthYear = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

// shortcut: "today" comes from the browser clock; ticket 04 stores the user's time zone and renders the week on the server
function useToday(): Date | null {
  const today = useSyncExternalStore(
    noSubscription,
    () => calendarDate(new Date()),
    () => null,
  );
  return today === null ? null : localDate(today);
}

function scrollIntoView(day: HTMLElement | null) {
  day?.scrollIntoView({ inline: "start", block: "nearest" });
}

function Day({
  date,
  today,
  rows,
}: {
  date: Date;
  today: boolean;
  rows: number;
}) {
  return (
    <section className={styles.day} ref={today ? scrollIntoView : undefined}>
      <h2
        className={styles.dayHeading}
        aria-current={today ? "date" : undefined}
      >
        <span className={styles.date}>{dayMonth.format(date)}</span>{" "}
        <span className={styles.weekday}>
          {today ? "Today" : weekday.format(date)}
        </span>
      </h2>
      <div className={styles.rows} aria-hidden="true">
        {Array.from({ length: rows }, (_, row) => (
          <div className={styles.row} key={row} />
        ))}
      </div>
    </section>
  );
}

export function Week({ actions }: { actions: ReactNode }) {
  const today = useToday();
  if (!today) return null;
  const days = currentWeek(today);
  const thursday = days[3];
  const isToday = (date: Date) => calendarDate(date) === calendarDate(today);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {monthYear.format(thursday)}{" "}
          <span className={styles.weekNumber}>W{isoWeek(thursday)}</span>
        </h1>
        <nav className={styles.actions} aria-label="Planner">
          {actions}
        </nav>
      </header>
      <div className={styles.week}>
        {days.slice(0, 5).map((date) => (
          <Day
            key={date.getTime()}
            date={date}
            today={isToday(date)}
            rows={10}
          />
        ))}
        <div className={styles.weekend}>
          {days.slice(5).map((date) => (
            <Day
              key={date.getTime()}
              date={date}
              today={isToday(date)}
              rows={4}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
