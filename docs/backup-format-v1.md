# YourWeek backup format v1

This is a user data interchange format, independent of the board, dialogs and browser database schema. Files are local UTF-8 JSON, not encrypted. Keep them private. To move a plan between devices or browser profiles, manually transfer the file and restore it at the destination. Restore **replaces**, never merges, the entire saved plan.

## Envelope

```json
{
  "format": "yourweek-backup",
  "version": 1,
  "exportedAt": "2026-10-05T12:00:00.000Z",
  "tasks": [],
  "lists": [{ "id": "inbox", "title": "Inbox", "order": 0 }],
  "settings": { "weekStartsOn": 1, "hideCompleted": false },
  "importHistory": []
}
```

All envelope properties are required. Unknown versions, unknown properties, missing properties and invalid values are refused, not guessed or migrated. Timestamps are canonical UTC ISO timestamps (as produced by `Date.toISOString()`). Array position is not display order: explicit `order` values determine order and may have gaps.

## Lists and tasks

A list has required `id` (nonblank string), `title` (nonblank string), and `order` (nonnegative safe integer). There must be at least one list. List titles must be unique after trimming and case folding; list orders must be unique.

A task has required:

- `id`: stable nonblank string, retained on restore.
- `title`: nonblank string.
- `completed`: boolean.
- `placement`: exactly one of `{ "date": "YYYY-MM-DD" }` or `{ "listId": "existing-list-id" }`. Dates are real calendar dates in years 0001–9999. Dates outside the displayed week, including all future dates, are included.
- `order`: nonnegative safe integer, unique within that date or list container.

Optional properties, when present:

- `notes`: string, including empty strings and newlines.
- `color`: one of `red`, `orange`, `yellow`, `green`, `blue`, `purple`. Absence means no color.
- `checklist`: array of `{ "id": "stable-id", "text": "nonblank text", "completed": false, "order": 0 }`. Status is boolean; orders are nonnegative safe integers, unique within the checklist. Checklist completion remains independent of parent completion.
- `provenance`: immutable original CSV source, described below. Editing working task fields does not rewrite source fields.

IDs are unique across tasks, lists and checklist items. Optional properties must not be `null`. Unknown properties in any object are refused. Content is preserved without title, note or source-field normalization on restore.

## CSV provenance and successful import history

Each provenance object has exactly:

```json
{
  "fingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "recordNumber": 2,
  "fields": {
    "Date": "2026-10-05",
    "Task": " Original title ",
    "Notes": "Original notes",
    "Checklist": "",
    "Completed": "TRUE",
    "List": ""
  }
}
```

`fingerprint` is the lowercase, 64-character SHA-256 hexadecimal digest of the original CSV bytes. `recordNumber` is a safe integer ≥ 2, counting logical CSV records including the header and ignored empty records, not physical lines. Each fingerprint/record-number pair is unique. All six `fields` properties are required strings and preserve the original strings. Source Task must be nonblank; Date is empty or a real calendar date; a dated source has blank List after trimming; Completed is TRUE/FALSE after trimming and case folding; source Checklist must be empty (the supported CSV format). The task's current placement, text and status may differ from its source.

Each successful import history entry has exactly `fingerprint`, `importedAt` (canonical UTC timestamp), `addedTasks`, and `emptyRecords` (nonnegative safe integers). Fingerprints are unique. Every provenance fingerprint references a history entry, and surviving source tasks cannot exceed its `addedTasks`. History may remain without source tasks after deletion: restoring it still prevents repeated import of identical original CSV bytes, even under a different filename.

## Settings and restore semantics

`settings` has exactly `weekStartsOn` (0 = Sunday, 1 = Monday) and `hideCompleted` (boolean). Both round-trip. Selected week is a transient navigation anchor, not a planner setting: it is excluded and resets to today's week after restore and on subsequent reloads.

Restore validates the entire file before offering confirmation. Selection and cancellation do not write anything. Confirmation clears and replaces tasks, lists, settings, navigation and import history in one IndexedDB transaction. Success means that transaction completed; abort leaves every previous store intact.

The backup excludes shell caches, browser storage permissions, unsaved drafts and open dialogs. Persistent-storage permission is browser/profile specific and cannot travel in the file. Even when granted, it does not replace backups or protect against deliberate browser-data clearing.
