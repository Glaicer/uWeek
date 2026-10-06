"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { provideTaskEditor, type TaskActions } from "../src/editor";
import { taskColors } from "../src/model";
import type { ChecklistItem, Task, TaskColor, TaskEdits } from "../src/model";

interface TaskEditorRequest {
  task: Task;
  trigger: HTMLElement;
  actions: TaskActions;
  changed: (task: Task | null) => void;
}

const saveFailure =
  "Изменения не сохранены: запись в этом браузере недоступна. Черновик оставлен открытым; повторите действие.";

export function TaskEditor() {
  const [request, setRequest] = useState<TaskEditorRequest | null>(null);
  const opened = useRef<(() => void) | null>(null);

  const open = useCallback(
    (
      task: Task,
      trigger: HTMLElement,
      actions: TaskActions,
      changed: (task: Task | null) => void,
    ) => {
      const request: TaskEditorRequest = { task, trigger, actions, changed };
      return new Promise<void>((resolve) => {
        opened.current = resolve;
        setRequest(request);
      });
    },
    [],
  );

  useEffect(() => {
    provideTaskEditor(open);
    return () => provideTaskEditor(null);
  }, [open]);

  const onOpened = useCallback(() => {
    opened.current?.();
    opened.current = null;
  }, []);

  const onClose = useCallback(() => setRequest(null), []);

  if (!request) return null;
  return (
    <TaskEditorDialog
      key={request.task.id}
      request={request}
      onOpened={onOpened}
      onClose={onClose}
    />
  );
}

function TaskEditorDialog(props: {
  request: TaskEditorRequest;
  onOpened: () => void;
  onClose: () => void;
}) {
  const { task, actions } = props.request;
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [color, setColor] = useState<TaskColor | "">(task.color ?? "");
  const [completed, setCompleted] = useState(task.completed);
  const [items, setItems] = useState<ChecklistItem[]>(() =>
    (task.checklist ?? [])
      .map((item) => ({ ...item }))
      .sort((first, second) => first.order - second.order),
  );
  const [alert, setAlert] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);

  const [initial] = useState(() => JSON.stringify(draft()));

  function draft(): Partial<TaskEdits> {
    return {
      title,
      notes,
      color: (color || undefined) as TaskColor | undefined,
      completed,
      ...(task.checklist !== undefined || items.length
        ? { checklist: items.map((item) => ({ ...item })) }
        : {}),
    };
  }

  const { onOpened } = props;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    titleInput.current?.focus();
    onOpened();
  }, [onOpened]);

  const close = () => {
    dialog.current?.close();
    const current = document.querySelector<HTMLElement>(
      `[data-task-id="${task.id}"]:not([hidden]) .task-title`,
    );
    const trigger = props.request.trigger;
    if (current) current.focus();
    else if (trigger.isConnected && !trigger.closest("[hidden]"))
      trigger.focus();
    else
      document
        .querySelector<HTMLInputElement>(".hide-completed input")
        ?.focus();
    props.onClose();
  };

  const cancel = () => {
    if (busyRef.current) return;
    if (
      JSON.stringify(draft()) !== initial &&
      !window.confirm("Отказаться от несохранённых изменений?")
    )
      return;
    close();
  };

  const save = async (remove: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setAlert("");
    try {
      if (remove) {
        await actions.deleteTask(task.id);
        props.request.changed(null);
      } else {
        const saved = await actions.updateTask(task.id, draft());
        props.request.changed(saved);
      }
      close();
    } catch {
      setAlert(saveFailure);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setAlert("Введите непустое название задачи");
      titleInput.current?.focus();
      return;
    }
    const empty = items.findIndex((item) => !item.text.trim());
    if (empty !== -1) {
      setAlert("Введите непустой текст пункта чек-листа");
      document.getElementById(`checklist-${items[empty].id}`)?.focus();
      return;
    }
    void save(false);
  };

  const remove = () => {
    if (busyRef.current) return;
    if (!window.confirm(`Удалить задачу «${task.title}» и все её данные?`))
      return;
    void save(true);
  };

  const addItem = () => {
    const item: ChecklistItem = {
      id: crypto.randomUUID(),
      text: "",
      completed: false,
      order: Math.max(-1, ...items.map((entry) => entry.order)) + 1,
    };
    flushSync(() => setItems([...items, item]));
    document.getElementById(`checklist-${item.id}`)?.focus();
  };

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    flushSync(() =>
      setItems(next.map((entry, order) => ({ ...entry, order }))),
    );
    dialog.current
      ?.querySelector<HTMLButtonElement>(
        `[aria-label="Переместить пункт ${target + 1} ${offset === -1 ? "вверх" : "вниз"}"]`,
      )
      ?.focus();
  };

  const removeItem = (index: number) => {
    const next = items
      .filter((_, position) => position !== index)
      .map((entry, order) => ({ ...entry, order }));
    flushSync(() => setItems(next));
    const target = next[Math.min(index, next.length - 1)];
    if (target) document.getElementById(`checklist-${target.id}`)?.focus();
    else
      dialog.current
        ?.querySelector<HTMLButtonElement>("[data-add-item]")
        ?.focus();
  };

  const trapTab = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      dialog.current!.querySelectorAll<HTMLElement>(
        "input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)",
      ),
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <dialog
      ref={dialog}
      className="task-editor"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onKeyDown={trapTab}
    >
      <h2 id="editor-title">Редактор задачи</h2>
      <form noValidate onSubmit={submit}>
        <label>
          Название
          <input
            ref={titleInput}
            name="title"
            required
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Заметка
          <textarea
            name="notes"
            rows={7}
            value={notes}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <label>
          Цвет
          <select
            name="color"
            value={color}
            disabled={busy}
            onChange={(event) => setColor(event.target.value as TaskColor | "")}
          >
            <option value="">Без цвета</option>
            {Object.entries(taskColors).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            name="completed"
            type="checkbox"
            checked={completed}
            disabled={busy}
            onChange={(event) => setCompleted(event.target.checked)}
          />
          Выполнена
        </label>
        <section aria-labelledby="checklist-title">
          <h3 id="checklist-title">Чек-лист</h3>
          <ol className="checklist">
            {items.map((item, index) => (
              <li key={item.id}>
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={busy}
                  aria-label={`Выполнен пункт ${index + 1}`}
                  onChange={(event) =>
                    setItems(
                      items.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, completed: event.target.checked }
                          : entry,
                      ),
                    )
                  }
                />
                <textarea
                  id={`checklist-${item.id}`}
                  rows={Math.max(2, item.text.split("\n").length)}
                  required
                  disabled={busy}
                  aria-label={`Текст пункта ${index + 1}`}
                  value={item.text}
                  onChange={(event) =>
                    setItems(
                      items.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, text: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                <div className="editor-actions">
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Переместить пункт ${index + 1} вверх`}
                    onClick={() => move(index, -1)}
                  >
                    Вверх
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Переместить пункт ${index + 1} вниз`}
                    onClick={() => move(index, 1)}
                  >
                    Вниз
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Удалить пункт ${index + 1}`}
                    onClick={() => removeItem(index)}
                  >
                    Удалить пункт
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" data-add-item disabled={busy} onClick={addItem}>
            Добавить пункт
          </button>
        </section>
        <p role="alert">{alert}</p>
        <div className="editor-actions">
          <button type="submit" disabled={busy}>
            Сохранить
          </button>
          <button type="button" disabled={busy} onClick={cancel}>
            Отмена
          </button>
          <button type="button" disabled={busy} onClick={remove}>
            Удалить задачу
          </button>
        </div>
      </form>
    </dialog>
  );
}
