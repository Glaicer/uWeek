"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SomedayList, Task } from "../src/model";
import { TaskContainer, type TaskFlow } from "./task-container";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Повторите действие.";
}

function ListSection(props: {
  list: SomedayList;
  tasks: Task[];
  createTask: (title: string) => Promise<Task>;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  hideCompleted: boolean;
  revealed: ReadonlySet<string>;
  flow: TaskFlow;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const renameToggleRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const placement = useMemo(() => ({ listId: props.list.id }), [props.list.id]);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const closeRename = () => {
    setRenaming(false);
    renameToggleRef.current?.focus();
  };

  const submitRename = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await props.onRename(props.list.id, renameDraft);
      props.flow.showStatus("Название списка сохранено");
      closeRename();
    } catch (error) {
      props.flow.showStatus(`Название не сохранено. ${errorText(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await props.onDelete(props.list.id);
      props.flow.showStatus("Список удалён");
    } catch (error) {
      props.flow.showStatus(`Список не удалён. ${errorText(error)}`);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      data-list-id={props.list.id}
      aria-label={`Список: ${props.list.title}`}
    >
      <h3>{props.list.title}</h3>
      <button
        ref={renameToggleRef}
        type="button"
        onClick={() => {
          setRenameDraft(props.list.title);
          setRenaming(true);
        }}
      >
        Переименовать список
      </button>
      <button type="button" disabled={removing} onClick={() => void remove()}>
        Удалить список
      </button>
      <form hidden={!renaming} onSubmit={(event) => void submitRename(event)}>
        <input
          ref={renameRef}
          type="text"
          aria-label="Название списка"
          value={renameDraft}
          disabled={saving}
          onChange={(event) => setRenameDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeRename();
          }}
        />
        <button type="submit" disabled={saving}>
          Сохранить название
        </button>
        <button type="button" onClick={closeRename}>
          Отмена переименования
        </button>
      </form>
      <TaskContainer
        label={props.list.title}
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

export function SomedaySection(props: {
  lists: SomedayList[];
  listTasks: Task[];
  createListTask: (title: string, listId: string) => Promise<Task>;
  createList: (title: string) => Promise<void>;
  renameList: (id: string, title: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  hideCompleted: boolean;
  revealed: ReadonlySet<string>;
  flow: TaskFlow;
}) {
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const deleteList = async (id: string) => {
    await props.deleteList(id);
    inputRef.current?.focus();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      await props.createList(draft);
      setDraft("");
      props.flow.showStatus("Список сохранён");
    } catch (error) {
      props.flow.showStatus(`Список не сохранён. ${errorText(error)}`);
    } finally {
      setCreating(false);
      inputRef.current?.focus();
    }
  };

  return (
    <section className="someday" aria-labelledby="someday-title">
      <h2 id="someday-title">Когда-нибудь</h2>
      <div className="lists">
        {props.lists.map((list) => (
          <ListSection
            key={list.id}
            list={list}
            tasks={props.listTasks.filter(
              (task) => task.placement.listId === list.id,
            )}
            createTask={(title) => props.createListTask(title, list.id)}
            onRename={props.renameList}
            onDelete={deleteList}
            hideCompleted={props.hideCompleted}
            revealed={props.revealed}
            flow={props.flow}
          />
        ))}
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Новый список"
          aria-label="Название нового списка"
          value={draft}
          disabled={creating}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setDraft("");
          }}
        />
        <button type="submit" disabled={creating}>
          Добавить список
        </button>
      </form>
    </section>
  );
}
