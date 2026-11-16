"use client";

import { useRef, useState, useTransition } from "react";
import { csvMaxBytes } from "../../../src/csv-limits";
import type { CsvImportPreview } from "../../../src/planner";
import { importCsv, previewCsv } from "../../actions";
import tools from "../../week.module.css";
import styles from "./import.module.css";

type Selection =
  | { status: "empty" }
  | { status: "ready"; file: File; preview: CsvImportPreview }
  | { status: "done"; message: string };

const quantity = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export function ImportForm() {
  const input = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection>({ status: "empty" });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function choose(file: File) {
    setSelection({ status: "empty" });
    setError("");
    if (file.size > csvMaxBytes) {
      setError("File exceeds the 5 MiB limit");
      return;
    }
    startTransition(async () => {
      const form = new FormData();
      form.set("file", file);
      try {
        const result = await previewCsv(form);
        if (result.error) setError(result.error);
        else if (result.preview)
          setSelection({ status: "ready", file, preview: result.preview });
      } catch {
        setError(
          "Could not upload the file. Check your connection and choose it again.",
        );
      }
    });
  }

  function confirm() {
    if (selection.status !== "ready") return;
    const { file, preview } = selection;
    setError("");
    startTransition(async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("fingerprint", preview.fingerprint);
      try {
        const response = await importCsv(form);
        if (response.error) setError(response.error);
        else if (response.result) {
          const { addedTasks, addedLists, alreadyImported } = response.result;
          setSelection({
            status: "done",
            message: `Added ${quantity(addedTasks, "task")} and ${quantity(addedLists, "list")}.${alreadyImported ? " This file was already imported." : ""}`,
          });
        }
      } catch {
        setError(
          "Could not confirm the import. Retry safely; the same file is never added twice.",
        );
      }
    });
  }

  return (
    <div aria-busy={pending}>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        aria-label="Tweek CSV file"
        hidden
        disabled={pending}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) choose(file);
        }}
      />
      <button
        className={tools.tool}
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        Choose CSV file
      </button>
      {pending && (
        <p className={styles.muted} aria-live="polite">
          Processing file…
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {selection.status === "done" && <p role="status">{selection.message}</p>}
      {selection.status === "ready" && (
        <section className={styles.preview} aria-label="Import preview">
          <h2>{selection.file.name}</h2>
          <p>
            {quantity(selection.preview.tasks, "task")} ·{" "}
            {selection.preview.completed} completed ·{" "}
            {selection.preview.undated} without a date
          </p>
          <p className={styles.muted}>
            {selection.preview.firstDate
              ? `${selection.preview.firstDate} – ${selection.preview.lastDate}`
              : "No dated tasks"}
          </p>
          <p>New lists: {selection.preview.newLists.join(", ") || "None"}</p>
          <p>
            {selection.preview.duplicateOccurrences} exact duplicate
            {selection.preview.duplicateOccurrences === 1 ? "" : "s"} (kept as
            separate tasks) · {selection.preview.emptyRecords} empty records
            skipped
          </p>
          {selection.preview.alreadyImported && (
            <p>Already imported. Confirming again adds zero tasks.</p>
          )}
          <h3>First {quantity(selection.preview.sample.length, "task")}</h3>
          <ol className={styles.sample}>
            {selection.preview.sample.map((task) => (
              <li key={task.recordNumber}>
                <span>{task.title}</span>
                <small className={styles.muted}>
                  {task.date || task.listTitle} ·{" "}
                  {task.completed ? "Completed" : "Not completed"}
                </small>
              </li>
            ))}
          </ol>
          <button
            className={`${tools.tool} ${tools.primary}`}
            type="button"
            disabled={pending}
            onClick={confirm}
          >
            {selection.preview.alreadyImported
              ? "Import again"
              : `Import ${quantity(selection.preview.tasks, "task")}`}
          </button>
        </section>
      )}
    </div>
  );
}
