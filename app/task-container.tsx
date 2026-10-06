"use client";

import { useEffect, useRef, useState } from "react";
import { openTaskEditor, type TaskActions } from "../src/editor";
import type { Placement, Task, TaskEdits } from "../src/model";

export interface TaskFlow {
  updateTask: (id: string, edits: Partial<TaskEdits>) => Promise<Task>;
  removeTask: (id: string) => void;
  publish: (changed: Task[]) => void;
  showStatus: (text: string) => void;
  requestFilterFocus: () => void;
  actions: TaskActions;
}

export interface TaskContainerProps {
  label: string;
  placement: Placement;
  tasks: Task[];
  createTask: (title: string) => Promise<Task>;
  hideCompleted: boolean;
  revealed: ReadonlySet<string>;
  flow: TaskFlow;
}

const saveFailure =
  "Задача не сохранена: запись в этом браузере недоступна. Проверьте доступ к хранилищу и повторите «Добавить». Ваш текст сохранён в поле ввода.";

function TaskRow(props: {
  task: Task;
  hidden: boolean;
  hideCompleted: boolean;
  flow: TaskFlow;
}) {
  const { task, flow } = props;
  const toggleRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (toggleRef.current) toggleRef.current.checked = task.completed;
  }, [task.completed]);

  const onToggle = async () => {
    const toggle = toggleRef.current;
    const edit = editRef.current;
    if (!toggle || !edit) return;
    setSaving(true);
    try {
      const saved = await flow.updateTask(task.id, {
        completed: toggle.checked,
      });
      flow.publish([saved]);
      flow.showStatus("Выполнение сохранено");
      if (props.hideCompleted && saved.completed) flow.requestFilterFocus();
    } catch {
      toggle.checked = task.completed;
      flow.showStatus("Выполнение не сохранено. Повторите действие.");
    } finally {
      setSaving(false);
    }
  };

  const onEdit = async () => {
    const edit = editRef.current;
    if (!edit) return;
    setOpening(true);
    try {
      await openTaskEditor(task, edit, flow.actions, (saved) => {
        if (!saved) flow.removeTask(task.id);
        else flow.publish([saved]);
        flow.showStatus(saved ? "Изменения сохранены" : "Задача удалена");
      });
    } catch {
      flow.showStatus("Редактор не открыт. Повторите действие.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <li
      className={`task-row${task.completed ? " completed" : ""}`}
      data-task-id={task.id}
      data-completed={String(task.completed)}
      data-color={task.color ?? ""}
      hidden={props.hidden}
    >
      <input
        ref={toggleRef}
        type="checkbox"
        defaultChecked={task.completed}
        aria-label={`Выполнена: ${task.title}`}
        disabled={saving}
        onChange={() => void onToggle()}
      />
      <button
        ref={editRef}
        type="button"
        className="task-title"
        disabled={saving || opening}
        onClick={() => void onEdit()}
      >
        {task.title}
      </button>
    </li>
  );
}

export function TaskContainer(props: TaskContainerProps) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tasks = [...props.tasks].sort(
    (first, second) =>
      first.order - second.order || first.id.localeCompare(second.id),
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !draft.trim()) return;
    setSaving(true);
    props.flow.showStatus("Сохранение…");
    try {
      const task = await props.createTask(draft);
      props.flow.publish([task]);
      setDraft("");
      props.flow.showStatus("Задача сохранена");
    } catch {
      props.flow.showStatus(saveFailure);
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <ul aria-label={`Задачи: ${props.label}`}>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            hidden={
              props.hideCompleted &&
              task.completed &&
              !props.revealed.has(task.id)
            }
            hideCompleted={props.hideCompleted}
            flow={props.flow}
          />
        ))}
      </ul>
      <form onSubmit={(event) => void submit(event)}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Новая задача"
          aria-label={`Новая задача: ${props.label}`}
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft("");
              props.flow.showStatus("Ввод отменён");
            }
          }}
        />
        <button type="submit" disabled={saving}>
          Добавить
        </button>
      </form>
    </>
  );
}
