import { test, expect } from "@playwright/test";
import { prepareCsv } from "../src/csv";
import { validPlacement } from "../src/placement";
import { createBackup, validateBackup } from "../src/backup";

for (const [date, valid] of [
  ["0000-01-01", false],
  ["2026-02-29", false],
  ["2100-02-29", false],
  ["2026-13-01", false],
  ["2026-04-31", false],
  ["2026-00-01", false],
  ["2026-01-00", false],
  ["2026-1-01", false],
  ["2026-01-01T00:00:00Z", false],
  ["2044-02-29", true],
  ["2400-02-29", true],
  ["0099-12-31", true],
  ["9999-12-31", true],
] as const) {
  test(`calendar domain agrees across CSV, placement and backup for ${date}`, async () => {
    expect(validPlacement({ date })).toBe(valid);
    const csv = prepareCsv(
      new Blob([
        `Date,Task,Notes,Checklist,Completed,List\n${date},Task,,,FALSE,`,
      ]),
    );
    if (valid) expect((await csv).records[0].date).toBe(date);
    else await expect(csv).rejects.toThrow("календарная Date");
    const backup = {
      format: "yourweek-backup",
      version: 1,
      exportedAt: "2026-10-06T00:00:00.000Z",
      tasks: [
        {
          id: "task",
          title: "Task",
          completed: false,
          placement: { date },
          order: 0,
        },
      ],
      lists: [{ id: "list", title: "List", order: 0 }],
      settings: { weekStartsOn: 1, hideCompleted: false },
      importHistory: [],
    };
    if (valid)
      expect(validateBackup(backup).tasks[0].placement).toEqual({ date });
    else expect(() => validateBackup(backup)).toThrow("Некорректная копия");
  });
}

test("internal neutral color is omitted without weakening external optional-field validation", () => {
  const snapshot = {
    tasks: [
      {
        id: "task",
        title: "Task",
        completed: false,
        placement: { date: "2044-02-29" },
        order: 0,
        color: undefined,
      },
    ],
    lists: [{ id: "list", title: "List", order: 0 }],
    settings: { weekStartsOn: 1 as const },
    hideCompleted: false,
    selectedWeek: undefined,
    importHistory: [],
  };
  const backup = createBackup(snapshot);
  expect(backup.tasks[0]).not.toHaveProperty("color");
  expect(snapshot.tasks[0]).toHaveProperty("color", undefined);
  for (const color of [undefined, null, "", "unknown"]) {
    expect(() =>
      validateBackup({ ...backup, tasks: [{ ...backup.tasks[0], color }] }),
    ).toThrow("Некорректная копия");
  }
});
