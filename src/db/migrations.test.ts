import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, expect, test } from "vitest";
import { testDatabaseUrl } from "../../tests/database";
import { db } from "./client";

afterAll(() => db.$client.end());

test("migration history contains no removed import artifacts", async () => {
  for (const file of await readdir("drizzle", { recursive: true })) {
    expect(file).not.toMatch(/tweek/i);
    if (!/\.(sql|json)$/.test(file)) continue;
    expect(await readFile(`drizzle/${file}`, "utf8")).not.toMatch(
      /tweek|import_history|provenance/i,
    );
  }
});

test("migration journal and snapshots form a continuous chain", async () => {
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  );
  let prevId = "00000000-0000-0000-0000-000000000000";
  for (const [index, entry] of journal.entries.entries()) {
    expect(entry.idx).toBe(index);
    expect(entry.tag).toMatch(
      new RegExp(`^${String(index).padStart(4, "0")}_`),
    );
    await readFile(`drizzle/${entry.tag}.sql`, "utf8");
    const snapshot = JSON.parse(
      await readFile(
        `drizzle/meta/${String(index).padStart(4, "0")}_snapshot.json`,
        "utf8",
      ),
    );
    expect(snapshot.prevId).toBe(prevId);
    prevId = snapshot.id;
  }
  expect(journal.entries[6]).toMatchObject({
    tag: "0006_api_tokens",
    when: 1794844324973,
  });
});

test("fresh migrations match the existing schema and can run again", async () => {
  const name = `migration_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  await db.$client.query(`CREATE DATABASE "${name}"`);
  try {
    const freshDb = drizzle({ client: pool });
    await migrate(freshDb, { migrationsFolder: "drizzle" });

    const schemaQuery = `
      SELECT 'column' AS kind, c.relname AS table_name, a.attname AS name,
        format_type(a.atttypid, a.atttypmod) AS definition,
        a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_value
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'constraint', c.relname, con.conname,
        pg_get_constraintdef(con.oid), NULL, NULL
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      UNION ALL
      SELECT 'index', tablename, indexname, indexdef, NULL, NULL
      FROM pg_indexes WHERE schemaname = 'public'
      ORDER BY kind, table_name, name
    `;
    expect((await pool.query(schemaQuery)).rows).toEqual(
      (await db.$client.query(schemaQuery)).rows,
    );

    const historyQuery =
      "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at";
    const before = (await pool.query(historyQuery)).rows;
    await migrate(freshDb, { migrationsFolder: "drizzle" });
    expect((await pool.query(historyQuery)).rows).toEqual(before);
  } finally {
    await pool.end();
    await db.$client.query(`DROP DATABASE "${name}"`);
  }
});
