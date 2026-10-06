"use client";

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
  return (
    <section
      className={`day${isToday ? " today" : ""}`}
      data-date={props.date}
      aria-label={label}
    >
      <h2>{label}</h2>
      {isToday && <p className="today-marker">Сегодня</p>}
      <TaskContainer
        label={label}
        placement={{ date: props.date }}
        tasks={props.tasks}
        createTask={props.createTask}
        hideCompleted={props.hideCompleted}
        revealed={props.revealed}
        flow={props.flow}
      />
    </section>
  );
}
