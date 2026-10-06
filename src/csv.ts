import Papa from "papaparse";

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

function recordError(record: number, reason: string): never {
  throw new Error(`Запись ${record}: ${reason}`);
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
    if (char === "\n") {
      record++;
      state = "start";
    } else if (char === ",") {
      state = "start";
    } else if (char === '"' && state === "start") {
      state = "quoted";
    } else if (char === '"' || state === "closed" || char === "\r") {
      recordError(
        record,
        "повреждённый CSV: неверное экранирование или разделитель",
      );
    } else {
      state = "bare";
    }
  }
  if (state === "quoted")
    recordError(record, "повреждённый CSV: незакрытая кавычка");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    year > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export async function prepareCsv(file: Blob): Promise<CsvPreview> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Файл превышает предел 5 MiB");
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Неверная кодировка: требуется корректный UTF-8");
  }
  text = text.replace(/\r\n/g, "\n");
  validateGrammar(text);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: ",",
    newline: "\n",
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    comments: false,
    fastMode: false,
  });
  if (parsed.errors.length) {
    const error = parsed.errors[0];
    recordError((error.row ?? 0) + 1, "повреждённый CSV");
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
      "требуются ровно заголовки Date, Task, Notes, Checklist, Completed, List без повторов",
    );
  }
  if (rows.length > 100_000)
    throw new Error("Файл превышает предел 100 000 логических записей");
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
    if (row.length !== 6) recordError(recordNumber, "требуется шесть полей");
    const fields = Object.fromEntries(
      headers.map((header, i) => [header, row[i]]),
    ) as Record<(typeof csvHeaders)[number], string>;
    if (!fields.Task.trim()) recordError(recordNumber, "пустое название Task");
    if (fields.Date !== "" && !validDate(fields.Date))
      recordError(recordNumber, "некорректная календарная Date (YYYY-MM-DD)");
    if (fields.Date !== "" && fields.List.trim() !== "")
      recordError(recordNumber, "неоднозначное размещение Date + List");
    if (fields.Checklist !== "")
      recordError(recordNumber, "непустой Checklist не поддерживается");
    if (!/^(true|false)$/i.test(fields.Completed.trim()))
      recordError(recordNumber, "Completed должен быть TRUE или FALSE");
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
      listTitle:
        fields.Date === "" ? fields.List.trim() || "Входящие" : undefined,
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
