import { readFile } from "node:fs/promises";
import { afterAll, expect, test } from "vitest";
import { db } from "./client";

afterAll(() => db.$client.end());

test("removing import metadata preserves existing tasks and lists", async () => {
  const migration = await readFile(
    "drizzle/0007_remove_tweek_import.sql",
    "utf8",
  );
  const client = await db.$client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE lists (LIKE public.lists INCLUDING ALL);
      CREATE TEMP TABLE tasks (LIKE public.tasks INCLUDING ALL);
      ALTER TABLE pg_temp.tasks ADD COLUMN IF NOT EXISTS provenance jsonb;
      CREATE TEMP TABLE import_history (fingerprint text);
      INSERT INTO pg_temp.lists (id, user_id, title, position)
        VALUES ('list', 'owner', 'Books', 0);
      INSERT INTO pg_temp.tasks
        (id, user_id, title, date, list_id, position, notes, completed_at, provenance)
        VALUES
          ('dated', 'owner', 'Dated task', '2026-11-16', NULL, 0, 'Keep notes', '2026-11-16T10:00:00Z', '{"recordNumber": 2}'),
          ('undated', 'owner', 'List task', NULL, 'list', 0, '', NULL, '{"recordNumber": 3}');
      INSERT INTO pg_temp.import_history VALUES ('fingerprint');
    `);
    const beforeTasks = await client.query(
      "SELECT to_jsonb(tasks) - 'provenance' AS task FROM pg_temp.tasks ORDER BY id",
    );
    const beforeLists = await client.query("SELECT * FROM pg_temp.lists");

    await client.query(migration);

    expect(
      (
        await client.query(
          "SELECT to_regclass('pg_temp.import_history') AS name",
        )
      ).rows,
    ).toEqual([{ name: null }]);
    expect(
      (
        await client.query(`
          SELECT attname FROM pg_attribute
          WHERE attrelid = 'pg_temp.tasks'::regclass
            AND attname = 'provenance' AND NOT attisdropped
        `)
      ).rows,
    ).toEqual([]);
    expect(
      (
        await client.query(
          "SELECT to_jsonb(tasks) AS task FROM pg_temp.tasks ORDER BY id",
        )
      ).rows,
    ).toEqual(beforeTasks.rows);
    expect((await client.query("SELECT * FROM pg_temp.lists")).rows).toEqual(
      beforeLists.rows,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
