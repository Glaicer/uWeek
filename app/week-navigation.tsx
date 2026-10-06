"use client";

import { calendarDate } from "../src/calendar";

export interface WeekNavigationProps {
  selected: Date;
  weekStartsOn: 0 | 1;
  onChange: (date: Date, focus: string) => void;
  onWeekStart: (value: 0 | 1, select: HTMLSelectElement) => void;
}

export function WeekNavigation(props: WeekNavigationProps) {
  const shift = (offset: number) =>
    new Date(
      props.selected.getFullYear(),
      props.selected.getMonth(),
      props.selected.getDate() + offset,
      12,
    );

  return (
    <nav aria-label="Навигация по неделям">
      <button
        type="button"
        onClick={() => props.onChange(shift(-7), "Предыдущая неделя")}
      >
        Предыдущая неделя
      </button>
      <button
        type="button"
        onClick={() => props.onChange(shift(7), "Следующая неделя")}
      >
        Следующая неделя
      </button>
      <button
        type="button"
        onClick={() => props.onChange(new Date(), "Сегодня")}
      >
        Сегодня
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(
            new FormData(event.currentTarget).get("goDate") ?? "",
          );
          if (value) props.onChange(localDate(value), "Перейти");
        }}
      >
        <label>
          Перейти к дате
          <input
            type="date"
            name="goDate"
            required
            key={calendarDate(props.selected)}
            defaultValue={calendarDate(props.selected)}
          />
        </label>
        <button type="submit">Перейти</button>
      </form>
      <label>
        Начало недели
        <select
          value={String(props.weekStartsOn)}
          onChange={(event) =>
            props.onWeekStart(
              Number(event.currentTarget.value) as 0 | 1,
              event.currentTarget,
            )
          }
        >
          <option value="1">Понедельник</option>
          <option value="0">Воскресенье</option>
        </select>
      </label>
    </nav>
  );
}

function localDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
