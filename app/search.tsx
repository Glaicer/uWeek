"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { SearchPage } from "../src/planner";
import { searchTasks } from "./actions";
import styles from "./week.module.css";

export function Search({ onSelect }: { onSelect: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const version = useRef(0);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchPage | null>(null);
  const [cursors, setCursors] = useState([0]);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function search(cursors: number[]) {
    const request = ++version.current;
    startTransition(async () => {
      try {
        const found = await searchTasks(query, cursors[cursors.length - 1]);
        if (request !== version.current) return;
        setResult(found);
        setCursors(cursors);
        setError(false);
      } catch {
        if (request === version.current) setError(true);
      }
    });
  }

  return (
    <>
      <button
        className={`${styles.tool} ${styles.searchButton}`}
        type="button"
        aria-label="Search tasks"
        title="Search tasks"
        onClick={() => dialog.current?.showModal()}
      >
        <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M0 0h24v24H0z" fill="none" />
          <path
            fill="currentColor"
            d="M18 10c0-4.41-3.59-8-8-8s-8 3.59-8 8s3.59 8 8 8c1.85 0 3.54-.63 4.9-1.69l5.1 5.1L21.41 20l-5.1-5.1A8 8 0 0 0 18 10M4 10c0-3.31 2.69-6 6-6s6 2.69 6 6s-2.69 6-6 6s-6-2.69-6-6"
          />
        </svg>
      </button>
      <dialog
        className={`${styles.card} ${styles.search}`}
        ref={dialog}
        aria-label="Search tasks"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.searchHead}>
          <h2>Search tasks</h2>
          <button
            className={styles.tool}
            type="button"
            aria-label="Close search"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <form
          className={styles.searchForm}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim() && !pending) search([0]);
          }}
        >
          <input
            className={styles.searchInput}
            type="search"
            aria-label="Search tasks"
            placeholder="Title or notes"
            maxLength={500}
            autoFocus
            value={query}
            onChange={(event) => {
              version.current++;
              setQuery(event.target.value);
              setResult(null);
              setError(false);
            }}
          />
          <button
            className={`${styles.tool} ${styles.primary}`}
            disabled={pending || !query.trim()}
          >
            Search
          </button>
        </form>
        {error && <p role="alert">Couldn&apos;t search. Try again.</p>}
        <div aria-live="polite" aria-busy={pending}>
          {pending && <p className={styles.searchStatus}>Searching…</p>}
          {!pending && result?.items.length === 0 && (
            <p className={styles.searchStatus}>No tasks found.</p>
          )}
          {result && (
            <>
              <ul className={styles.searchResults}>
                {result.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      className={styles.searchResult}
                      href={`/?focus=${item.id}`}
                      prefetch={false}
                      aria-label={item.title}
                      onClick={() => {
                        dialog.current?.close();
                        if (
                          new URL(window.location.href).searchParams.get(
                            "focus",
                          ) === item.id
                        )
                          onSelect(item.id);
                      }}
                    >
                      <span className={styles.searchResultTitle}>
                        {item.title}
                        {item.repeats && (
                          <span className={styles.searchStatus}>
                            {" "}
                            · Repeats
                          </span>
                        )}
                      </span>
                      {item.notes && (
                        <span className={styles.searchNotes}>{item.notes}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              {(cursors.length > 1 || result.nextCursor !== null) && (
                <div className={styles.searchPages}>
                  <button
                    className={styles.tool}
                    type="button"
                    disabled={pending || cursors.length === 1}
                    onClick={() => search(cursors.slice(0, -1))}
                  >
                    Previous results
                  </button>
                  <span>Page {cursors.length}</span>
                  <button
                    className={styles.tool}
                    type="button"
                    disabled={pending || result.nextCursor === null}
                    onClick={() => search([...cursors, result.nextCursor!])}
                  >
                    Next results
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
