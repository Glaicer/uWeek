import { test, expect } from "@playwright/test";

test("one public snapshot includes tasks, lists, preferences, navigation and successful import history", async ({
  page,
}) => {
  await page.goto("/dev-storage");
  await page.waitForFunction(() => Boolean(window.__yourweekDevStorage));
  const snapshot = await page.evaluate(async () => {
    const { PlannerStorage, prepareCsv } = window.__yourweekDevStorage!;
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
    snapshot.tasks[0].provenance!.fingerprint,
  );
});
