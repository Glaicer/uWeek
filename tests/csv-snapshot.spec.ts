import { test, expect } from "@playwright/test";

test("one public snapshot includes tasks, lists, preferences, navigation and successful import history", async ({
  page,
}) => {
  await page.goto("/");
  const snapshot = await page.evaluate(async () => {
    const storagePath = "/src/storage.ts";
    const csvPath = "/src/csv.ts";
    const { PlannerStorage } = await import(storagePath);
    const { prepareCsv } = await import(csvPath);
    const storage = await PlannerStorage.open();
    await storage.saveSettings({ weekStartsOn: 0 });
    await storage.saveHideCompleted(true);
    await storage.saveSelectedWeek("2041-02-24");
    await storage.commitCsv(
      await prepareCsv(
        new Blob([
          "Date,Task,Notes,Checklist,Completed,List\n2041-02-28,Snapshot,,,FALSE,",
        ]),
      ),
    );
    return await storage.readSnapshot();
  });
  expect(snapshot.tasks).toHaveLength(1);
  expect(snapshot.lists).toHaveLength(3);
  expect(snapshot.settings).toEqual({ weekStartsOn: 0 });
  expect(snapshot.hideCompleted).toBe(true);
  expect(snapshot.selectedWeek).toBe("2041-02-24");
  expect(snapshot.importHistory).toHaveLength(1);
  expect(snapshot.importHistory[0].fingerprint).toBe(
    snapshot.tasks[0].provenance.fingerprint,
  );
});
