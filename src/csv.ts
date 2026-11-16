import Papa from "papaparse";
import { validCalendarDate as validDate } from "./calendar";
import { csvMaxBytes } from "./csv-limits";

export const csvHeaders = [
  "Date",
  "Task",
  "Notes",
  "Checklist",
  "Completed",
  "List",
] as const;
export type CsvFields = Readonly<Record<(typeof csvHeaders)[number], string>>;
export interface CsvRecord {
  readonly recordNumber: number;
  readonly fields: CsvFields;
  readonly title: string;
  readonly notes: string;
  readonly date: string;
  readonly listTitle: string | undefined;
  readonly completed: boolean;
}
export interface CsvPreview {
  readonly fingerprint: string;
  readonly records: readonly CsvRecord[];
  readonly emptyRecords: number;
  readonly completed: number;
  readonly duplicateOccurrences: number;
  readonly undated: number;
  readonly listTitles: readonly string[];
  readonly firstDate: string | undefined;
  readonly lastDate: string | undefined;
}

export class CsvError extends Error {}

function recordError(record: number, reason: string): never {
  throw new CsvError(`Record ${record}: ${reason}`);
}

function validateGrammar(text: string): void {
  let state: "start" | "bare" | "quoted" | "closed" = "start";
  let record = 1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === "quoted") {
      if (char === '"') {
        if (text[i + 1] === '"') i++;
        else state = "closed";
      }
      continue;
    }
    if (char === "\r" && text[i + 1] === "\n") continue;
    if (char === "\n") {
      record++;
      state = "start";
    } else if (char === ",") {
      state = "start";
    } else if (char === '"' && state === "start") {
      state = "quoted";
    } else if (char === '"' || state === "closed" || char === "\r") {
      recordError(record, "Malformed CSV: invalid quoting or delimiter");
    } else {
      state = "bare";
    }
  }
  if (state === "quoted") recordError(record, "Malformed CSV: unclosed quote");
}

export async function prepareCsv(file: Blob): Promise<CsvPreview> {
  if (file.size > csvMaxBytes)
    throw new CsvError("File exceeds the 5 MiB limit");
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CsvError("Invalid encoding: valid UTF-8 is required");
  }
  validateGrammar(text);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: ",",
    newline: text.slice(0, text.indexOf("\n")).endsWith("\r") ? "\r\n" : "\n",
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    comments: false,
    fastMode: false,
  });
  if (parsed.errors.length) {
    const error = parsed.errors[0];
    recordError((error.row ?? 0) + 1, "Malformed CSV");
  }
  const rows = parsed.data;
  if (text.endsWith("\n")) rows.pop();
  const headers = rows.shift() ?? [];
  if (
    headers.length !== 6 ||
    new Set(headers).size !== 6 ||
    headers.some((header) => !csvHeaders.some((known) => known === header))
  ) {
    recordError(
      1,
      "Expected exactly Date, Task, Notes, Checklist, Completed, List headers without duplicates",
    );
  }
  if (rows.length > 100_000)
    throw new CsvError("File exceeds the limit of 100,000 logical records");
  const records: CsvRecord[] = [];
  let emptyRecords = 0;
  let duplicateOccurrences = 0;
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const recordNumber = index + 2;
    if (row.every((field) => field === "")) {
      emptyRecords++;
      continue;
    }
    if (row.length !== 6) recordError(recordNumber, "Expected six fields");
    const fields = Object.fromEntries(
      headers.map((header, i) => [header, row[i]]),
    ) as Record<(typeof csvHeaders)[number], string>;
    if (!fields.Task.trim()) recordError(recordNumber, "Empty Task title");
    if (fields.Date !== "" && !validDate(fields.Date))
      recordError(recordNumber, "Invalid calendar Date (YYYY-MM-DD)");
    if (fields.Date !== "" && fields.List.trim() !== "")
      recordError(recordNumber, "Ambiguous placement: Date + List");
    if (fields.Checklist !== "")
      recordError(recordNumber, "Non-empty Checklist is not supported");
    if (!/^(true|false)$/i.test(fields.Completed.trim()))
      recordError(recordNumber, "Completed must be TRUE or FALSE");
    const signature = JSON.stringify(
      csvHeaders.map((header) => fields[header]),
    );
    if (seen.has(signature)) duplicateOccurrences++;
    seen.add(signature);
    records.push({
      recordNumber,
      fields: Object.freeze(fields),
      title: fields.Task.trim(),
      notes: fields.Notes,
      date: fields.Date,
      listTitle: fields.Date === "" ? fields.List.trim() || "Inbox" : undefined,
      completed: fields.Completed.trim().toLowerCase() === "true",
    });
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const dates = records
    .map((record) => record.date)
    .filter(Boolean)
    .sort();
  const listTitles = new Map<string, string>();
  for (const record of records) {
    if (
      record.listTitle !== undefined &&
      !listTitles.has(record.listTitle.toLowerCase())
    )
      listTitles.set(record.listTitle.toLowerCase(), record.listTitle);
  }
  return {
    fingerprint,
    records,
    emptyRecords,
    completed: records.filter((record) => record.completed).length,
    duplicateOccurrences,
    undated: records.filter((record) => record.date === "").length,
    listTitles: [...listTitles.values()],
    firstDate: dates[0],
    lastDate: dates.at(-1),
  };
}
