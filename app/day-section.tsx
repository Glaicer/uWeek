"use client";

import { useMemo, useRef } from "react";
import type { Task } from "../src/model";
import { TaskContainer, type TaskFlow } from "./task-container";

const dayLabel = new Intl.DateTimeFormat("ru", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function DaySection(props: {
  day: Date;
  date: string;
  today: string;
  tasks: Task[];
  createTask: (title: string) => Promise<Task>;
  hideCompleted: boolean;
  revealed: ReadonlySet<string>;
  flow: TaskFlow;
}) {
  const label = dayLabel.format(props.day);
  const isToday = props.date === props.today;
  const sectionRef = useRef<HTMLElement>(null);
  const placement = useMemo(() => ({ date: props.date }), [props.date]);
  return (
    <section
      ref={sectionRef}
      className={`day${isToday ? " today" : ""}`}
      data-date={props.date}
      aria-label={label}
    >
      <h2>{label}</h2>
      {isToday && <p className="today-marker">Сегодня</p>}
      <TaskContainer
        label={label}
        placement={placement}
        tasks={props.tasks}
        createTask={props.createTask}
        hideCompleted={props.hideCompleted}
        revealed={props.revealed}
        sectionRef={sectionRef}
        flow={props.flow}
      />
    </section>
  );
}
