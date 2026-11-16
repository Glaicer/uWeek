import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { CsvError, prepareCsv, type CsvPreview, type CsvRecord } from "./csv";
import { db } from "./db/client";
import { importHistory, lists, tasks, users } from "./db/schema";

const fileInput = z.instanceof(Blob);
const fingerprintInput = z.string().regex(/^[0-9a-f]{64}$/);
const listKey = (title: string) => title.trim().toLowerCase();

export interface CsvImportPreview {
  fingerprint: string;
  tasks: number;
  completed: number;
  undated: number;
  emptyRecords: number;
  duplicateOccurrences: number;
  firstDate: string | undefined;
  lastDate: string | undefined;
  newLists: string[];
  alreadyImported: boolean;
  sample: Pick<
    CsvRecord,
    "recordNumber" | "title" | "date" | "listTitle" | "completed"
  >[];
}

export async function previewCsv(
  userId: string,
  file: Blob,
): Promise<CsvImportPreview> {
  const preview = await prepareCsv(fileInput.parse(file));
  const [existing, history] = await Promise.all([
    db
      .select({ title: lists.title })
      .from(lists)
      .where(eq(lists.userId, userId)),
    db
      .select({ fingerprint: importHistory.fingerprint })
      .from(importHistory)
      .where(
        and(
          eq(importHistory.userId, userId),
          eq(importHistory.fingerprint, preview.fingerprint),
        ),
      ),
  ]);
  const known = new Set(existing.map((list) => listKey(list.title)));
  return {
    fingerprint: preview.fingerprint,
    tasks: preview.records.length,
    completed: preview.completed,
    undated: preview.undated,
    emptyRecords: preview.emptyRecords,
    duplicateOccurrences: preview.duplicateOccurrences,
    firstDate: preview.firstDate,
    lastDate: preview.lastDate,
    newLists: preview.listTitles.filter((title) => !known.has(listKey(title))),
    alreadyImported: history.length > 0,
    sample: preview.records
      .slice(0, 20)
      .map(({ recordNumber, title, date, listTitle, completed }) => ({
        recordNumber,
        title,
        date,
        listTitle,
        completed,
      })),
  };
}

export async function importCsv(
  userId: string,
  file: Blob,
  fingerprint: string,
) {
  fingerprintInput.parse(fingerprint);
  const preview = await prepareCsv(fileInput.parse(file));
  if (preview.fingerprint !== fingerprint)
    throw new CsvError(
      "The file changed. Choose it again to review a new preview.",
    );
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) throw new Error("User not found");
    const history = await tx
      .insert(importHistory)
      .values({
        userId,
        fingerprint,
        addedTasks: preview.records.length,
        addedLists: 0,
        emptyRecords: preview.emptyRecords,
      })
      .onConflictDoNothing()
      .returning({ fingerprint: importHistory.fingerprint });
    if (!history.length)
      return { addedTasks: 0, addedLists: 0, alreadyImported: true };

    const existing = await tx
      .select({ id: lists.id, title: lists.title, position: lists.position })
      .from(lists)
      .where(eq(lists.userId, userId))
      .orderBy(asc(lists.position), asc(lists.createdAt), asc(lists.id))
      .for("update");
    const byTitle = new Map<string, string>();
    for (const list of existing)
      if (!byTitle.has(listKey(list.title)))
        byTitle.set(listKey(list.title), list.id);
    let position = Math.max(-1, ...existing.map((list) => list.position)) + 1;
    const newLists = preview.listTitles
      .filter((title) => !byTitle.has(listKey(title)))
      .map((title) => {
        const id = crypto.randomUUID();
        byTitle.set(listKey(title), id);
        return { id, userId, title, position: position++ };
      });
    for (let offset = 0; offset < newLists.length; offset += 500)
      await tx.insert(lists).values(newLists.slice(offset, offset + 500));

    const ends = await tx
      .select({
        date: tasks.date,
        listId: tasks.listId,
        position: max(tasks.position),
      })
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .groupBy(tasks.date, tasks.listId);
    const positions = new Map(
      ends.map((row) => [row.date ?? row.listId!, (row.position ?? -1) + 1]),
    );
    const rows = importRows(userId, preview, byTitle, positions);
    for (let offset = 0; offset < rows.length; offset += 500)
      await tx.insert(tasks).values(rows.slice(offset, offset + 500));
    await tx
      .update(importHistory)
      .set({ addedLists: newLists.length })
      .where(
        and(
          eq(importHistory.userId, userId),
          eq(importHistory.fingerprint, fingerprint),
        ),
      );
    return {
      addedTasks: rows.length,
      addedLists: newLists.length,
      alreadyImported: false,
    };
  });
}

function importRows(
  userId: string,
  preview: CsvPreview,
  byTitle: Map<string, string>,
  positions: Map<string, number>,
): (typeof tasks.$inferInsert)[] {
  return preview.records.map((record) => {
    const place = record.date
      ? { date: record.date }
      : { listId: byTitle.get(listKey(record.listTitle!))! };
    const key = place.date ?? place.listId!;
    const position = positions.get(key) ?? 0;
    positions.set(key, position + 1);
    return {
      id: crypto.randomUUID(),
      userId,
      title: record.title,
      notes: record.notes,
      completedAt: record.completed ? new Date() : null,
      ...place,
      position,
      provenance: {
        fingerprint: preview.fingerprint,
        recordNumber: record.recordNumber,
        fields: record.fields,
      },
    };
  });
}
