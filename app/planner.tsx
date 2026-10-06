"use client";

import { createPortal, flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calendarDate, currentWeek, formatDate } from "../src/calendar";
import { mountData } from "../src/data-ui";
import { renderLists, type ListActions } from "../src/lists";
import type { TaskActions } from "../src/editor";
import { mountSearch } from "../src/search";
import type {
  PlannerSettings,
  SomedayList,
  Task,
  TaskEdits,
} from "../src/model";
import { PlannerStorage } from "../src/storage";
import { CsvImport } from "./csv-import";
import { DaySection } from "./day-section";
import { WeekNavigation } from "./week-navigation";
import type { TaskFlow } from "./task-container";

const bootStatus = "Загрузка планера…";
const bootError =
  "Локальная база недоступна. Задачи не загружены. Разрешите хранение данных в этом браузере и повторите попытку.";

const taskChangesBus = new EventTarget();

function localDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

type Phase = "loading" | "ready" | "error";

interface CsvHost {
  section: HTMLElement;
  storage: PlannerStorage;
}

export function Planner() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Date | null>(null);
  const [settings, setSettings] = useState<PlannerSettings | null>(null);
  const [weekTasks, setWeekTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<SomedayList[]>([]);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [csvHost, setCsvHost] = useState<CsvHost | null>(null);

  const storageRef = useRef<PlannerStorage | null>(null);
  const selectedRef = useRef<Date | null>(null);
  const weekStartRef = useRef<0 | 1>(1);
  const weekTasksRef = useRef<Task[]>([]);
  const listsRef = useRef<SomedayList[]>([]);
  const listTasksRef = useRef<Task[]>([]);
  const generationRef = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const somedayRef = useRef<HTMLElement>(null);

  const showStatus = useCallback((text: string) => {
    if (statusRef.current) statusRef.current.textContent = text;
  }, []);

  const publish = useCallback((changed: Task[]) => {
    taskChangesBus.dispatchEvent(new CustomEvent("tasks", { detail: changed }));
  }, []);

  const publishFilter = useCallback(() => {
    taskChangesBus.dispatchEvent(new CustomEvent("filter"));
  }, []);

  const putWeekTasks = useCallback((tasks: Task[]) => {
    weekTasksRef.current = tasks;
    setWeekTasks(tasks);
  }, []);

  const putLists = useCallback((next: SomedayList[]) => {
    listsRef.current = next;
    setLists(next);
  }, []);

  const removeTask = useCallback(
    (id: string) => {
      putWeekTasks(weekTasksRef.current.filter((task) => task.id !== id));
      listTasksRef.current = listTasksRef.current.filter(
        (task) => task.id !== id,
      );
    },
    [putWeekTasks],
  );

  const refreshTo = useCallback(
    async (date: Date, weekStartsOn: 0 | 1): Promise<boolean> => {
      const opened = storageRef.current;
      if (!opened) return false;
      const generation = ++generationRef.current;
      try {
        const days = currentWeek(date, weekStartsOn);
        const [tasks, nextLists, nextHide, nextListTasks] = await Promise.all([
          opened.readWeek(calendarDate(days[0]), calendarDate(days[6])),
          opened.readLists(),
          opened.readHideCompleted(),
          opened.readListTasks(),
        ]);
        if (generationRef.current !== generation) return false;
        flushSync(() => {
          selectedRef.current = date;
          weekStartRef.current = weekStartsOn;
          setSelected(date);
          setSettings({ weekStartsOn });
          putWeekTasks(tasks);
          putLists(nextLists);
          setHideCompleted(nextHide);
          listTasksRef.current = nextListTasks;
        });
        return true;
      } catch (error) {
        if (generationRef.current !== generation) return false;
        throw error;
      }
    },
    [putLists, putWeekTasks],
  );

  const change = useCallback(
    async (date: Date, focus: string) => {
      const opened = storageRef.current;
      if (!opened) return;
      try {
        await opened.saveSelectedWeek(calendarDate(date));
        selectedRef.current = date;
        setSelected(date);
        const applied = await refreshTo(date, weekStartRef.current);
        if (!applied) return;
        if (focus === "Сегодня" && window.innerWidth < 1200) {
          mainRef.current
            ?.querySelector(".today")
            ?.scrollIntoView({ block: "start" });
        }
      } catch {
        showStatus(
          "Переход не сохранён. Проверьте доступ к хранилищу и повторите действие.",
        );
      }
    },
    [refreshTo, showStatus],
  );

  const onWeekStart = useCallback(
    async (value: 0 | 1, select: HTMLSelectElement) => {
      const opened = storageRef.current;
      const current = selectedRef.current;
      if (!opened || !current) return;
      select.disabled = true;
      try {
        await opened.saveSettings({ weekStartsOn: value });
        const applied = await refreshTo(current, value);
        if (!applied) return;
        select.focus();
      } catch {
        select.value = String(weekStartRef.current);
        showStatus(
          "Настройка не сохранена. Повторите изменение начала недели.",
        );
        select.focus();
      } finally {
        select.disabled = false;
      }
    },
    [refreshTo, showStatus],
  );

  const onFilterChange = useCallback(
    async (input: HTMLInputElement) => {
      const opened = storageRef.current;
      if (!opened) return;
      const value = input.checked;
      input.disabled = true;
      try {
        await opened.saveHideCompleted(value);
        setHideCompleted(value);
        publishFilter();
        showStatus("Настройка сохранена");
      } catch {
        input.checked = !value;
        showStatus("Настройка не сохранена. Повторите действие.");
      } finally {
        input.disabled = false;
      }
    },
    [publishFilter, showStatus],
  );

  const goToTask = useCallback(
    async (task: Task) => {
      const opened = storageRef.current;
      const current = selectedRef.current;
      if (!opened || !current) return;
      try {
        if (task.placement.date) {
          await opened.saveSelectedWeek(task.placement.date);
          const applied = await refreshTo(
            localDate(task.placement.date),
            weekStartRef.current,
          );
          if (!applied) return;
        } else {
          const applied = await refreshTo(current, weekStartRef.current);
          if (!applied) return;
        }
        flushSync(() => {
          setRevealed((prev) => {
            const next = new Set(prev);
            next.add(task.id);
            return next;
          });
        });
        const row = mainRef.current?.querySelector<HTMLElement>(
          `[data-task-id="${task.id}"]`,
        );
        if (row) {
          if (!row.closest(".week")) row.hidden = false;
          row.scrollIntoView({ block: "center" });
          row.querySelector<HTMLButtonElement>(".task-title")?.focus();
        }
      } catch {
        showStatus(
          "Переход не сохранён. Проверьте доступ к хранилищу и повторите действие.",
        );
      }
    },
    [refreshTo, showStatus],
  );

  const restored = useCallback(async () => {
    const opened = storageRef.current;
    if (!opened) throw new Error("Хранилище закрыто");
    const next = await opened.readSettings();
    await refreshTo(new Date(), next.weekStartsOn);
  }, [refreshTo]);

  const refreshBoard = useCallback(async () => {
    const current = selectedRef.current;
    if (!current) return;
    await refreshTo(current, weekStartRef.current);
  }, [refreshTo]);

  const requestFilterFocus = useCallback(() => {
    filterRef.current?.focus();
  }, []);

  const taskActions = useMemo<TaskActions>(
    () => ({
      updateTask: (id, edits: Partial<TaskEdits>) =>
        storageRef.current!.updateTask(id, edits),
      deleteTask: (id) => storageRef.current!.deleteTask(id),
      readLists: () => storageRef.current!.readLists(),
      reorderTask: (id, targetId, position, hide) =>
        storageRef.current!.reorderTask(id, targetId, position, hide),
      taskChanges: taskChangesBus,
    }),
    [],
  );

  const flow = useMemo<TaskFlow>(
    () => ({
      updateTask: (id: string, edits: Partial<TaskEdits>) =>
        storageRef.current!.updateTask(id, edits),
      removeTask,
      publish,
      showStatus,
      requestFilterFocus,
      actions: taskActions,
    }),
    [publish, removeTask, requestFilterFocus, showStatus, taskActions],
  );

  const createTask = useCallback(async (title: string, date: string) => {
    const opened = storageRef.current;
    if (!opened) throw new Error("Хранилище закрыто");
    return opened.createTask(title, date);
  }, []);

  useEffect(() => {
    let stale = false;
    void (async () => {
      try {
        const opened = await PlannerStorage.open();
        if (stale) return;
        const savedWeek = await opened.readSelectedWeek();
        if (stale) return;
        const initial = localDate(savedWeek ?? calendarDate(new Date()));
        if (!savedWeek) await opened.saveSelectedWeek(calendarDate(initial));
        if (stale) return;
        const initialSettings = await opened.readSettings();
        if (stale) return;
        const days = currentWeek(initial, initialSettings.weekStartsOn);
        const [tasks, nextLists, nextHide, nextListTasks] = await Promise.all([
          opened.readWeek(calendarDate(days[0]), calendarDate(days[6])),
          opened.readLists(),
          opened.readHideCompleted(),
          opened.readListTasks(),
        ]);
        if (stale) return;
        storageRef.current = opened;
        selectedRef.current = initial;
        weekStartRef.current = initialSettings.weekStartsOn;
        weekTasksRef.current = tasks;
        listsRef.current = nextLists;
        listTasksRef.current = nextListTasks;
        setSelected(initial);
        setSettings(initialSettings);
        setWeekTasks(tasks);
        setLists(nextLists);
        setHideCompleted(nextHide);
        setPhase("ready");
      } catch {
        if (stale) return;
        setPhase("error");
      }
    })();
    return () => {
      stale = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (filterRef.current) filterRef.current.checked = hideCompleted;
  }, [hideCompleted]);

  useEffect(() => {
    const listener = (event: Event) => {
      const changed = (event as CustomEvent<Task[]>).detail;
      const current = selectedRef.current;
      if (!current) return;
      const days = currentWeek(current, weekStartRef.current);
      const firstDate = calendarDate(days[0]);
      const lastDate = calendarDate(days[6]);
      putWeekTasks([
        ...weekTasksRef.current.filter(
          (task) => !changed.some((entry) => entry.id === task.id),
        ),
        ...changed.filter(
          (task) =>
            task.placement.date !== undefined &&
            task.placement.date >= firstDate &&
            task.placement.date <= lastDate,
        ),
      ]);
      listTasksRef.current = [
        ...listTasksRef.current.filter(
          (task) => !changed.some((entry) => entry.id === task.id),
        ),
        ...changed.filter((task) => task.placement.listId !== undefined),
      ];
    };
    taskChangesBus.addEventListener("tasks", listener);
    return () => taskChangesBus.removeEventListener("tasks", listener);
  }, [putWeekTasks]);

  useEffect(() => {
    if (phase !== "ready") return;
    const header = headerRef.current;
    if (!header) return;
    mountSearch(
      header,
      storageRef.current!,
      taskActions,
      refreshBoard,
      goToTask,
    );
    return () => {
      header.querySelector("[data-search-trigger]")?.remove();
    };
  }, [goToTask, phase, refreshBoard, taskActions]);

  useEffect(() => {
    if (phase !== "ready") return;
    const main = mainRef.current;
    const opened = storageRef.current;
    if (!main || !opened) return;
    mountData(main, opened, refreshBoard, restored, { csvImport: false });
    const section = main.querySelector<HTMLElement>(
      'section[aria-label="Данные"]',
    );
    if (section) setCsvHost({ section, storage: opened });
    return () => {
      main.querySelector('section[aria-label="Данные"]')?.remove();
      setCsvHost(null);
    };
  }, [phase, refreshBoard, restored]);

  const listSignature = lists.map((list) => list.id).join("\n");

  useEffect(() => {
    if (phase !== "ready") return;
    const section = somedayRef.current;
    if (!section) return;
    const listActions: ListActions = {
      ...taskActions,
      listTasks: listTasksRef.current,
      createListTask: (title, listId) =>
        storageRef.current!.createListTask(title, listId),
      createList: (title) => storageRef.current!.createList(title),
      renameList: (id, title) => storageRef.current!.renameList(id, title),
      deleteList: (id) => storageRef.current!.deleteList(id),
    };
    renderLists(
      section,
      listsRef.current,
      listActions,
      statusRef.current!,
      filterRef.current!,
    );
    return () => {
      section.querySelector(".lists")?.replaceChildren();
      for (const form of section.querySelectorAll(":scope > form")) {
        form.remove();
      }
    };
  }, [listSignature, phase, taskActions]);

  if (phase === "loading") {
    return (
      <main id="app">
        <p role="status">{bootStatus}</p>
      </main>
    );
  }

  if (phase === "error" || !selected || !settings) {
    return (
      <main id="app">
        <h1>YourWeek</h1>
        <p role="alert">{bootError}</p>
        <button
          type="button"
          onClick={() => {
            setPhase("loading");
            setAttempt((value) => value + 1);
          }}
        >
          Повторить
        </button>
      </main>
    );
  }

  const days = currentWeek(selected, settings.weekStartsOn);

  return (
    <main id="app" ref={mainRef}>
      <header ref={headerRef}>
        <p className="brand">YourWeek</p>
        <h1>
          {formatDate(days[0])} – {formatDate(days[6])}
        </h1>
        <p>Неделя для ваших планов — без спешки и расписания по часам.</p>
        <WeekNavigation
          selected={selected}
          weekStartsOn={settings.weekStartsOn}
          onChange={(date, focus) => void change(date, focus)}
          onWeekStart={(value, select) => void onWeekStart(value, select)}
        />
      </header>
      <aside aria-label="Хранение данных">
        <strong>Ваши данные остаются в этом браузере.</strong> Облачной
        синхронизации нет. Очистка данных сайта может удалить задачи; приватный
        режим не гарантирует сохранность. Используйте один браузерный профиль и
        одну рабочую вкладку.
      </aside>
      <p
        className="feedback"
        role="status"
        aria-live="polite"
        ref={statusRef}
      />
      <label className="hide-completed check-label">
        <input
          ref={filterRef}
          type="checkbox"
          defaultChecked={hideCompleted}
          onChange={(event) => void onFilterChange(event.currentTarget)}
        />
        Скрыть выполненные
      </label>
      <div className="week">
        {days.map((day) => {
          const date = calendarDate(day);
          return (
            <DaySection
              key={date}
              day={day}
              date={date}
              today={calendarDate(new Date())}
              tasks={weekTasks.filter((task) => task.placement.date === date)}
              createTask={(title) => createTask(title, date)}
              hideCompleted={hideCompleted}
              revealed={revealed}
              flow={flow}
            />
          );
        })}
      </div>
      <section
        className="someday"
        aria-labelledby="someday-title"
        ref={somedayRef}
      >
        <h2 id="someday-title">Когда-нибудь</h2>
        <div className="lists" />
      </section>
      {csvHost
        ? createPortal(
            <CsvImport
              storage={csvHost.storage}
              refresh={refreshBoard}
              showStatus={showStatus}
            />,
            csvHost.section,
          )
        : null}
    </main>
  );
}
