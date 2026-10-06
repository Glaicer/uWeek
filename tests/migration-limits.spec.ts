import { test, expect } from "@playwright/test";

test("CSV preview makes unrecoverable lists and the last-date recurrence boundary explicit", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "limits.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Task,Notes,Checklist,Completed,List\n2040-01-01,Synthetic,,,FALSE,",
    ),
  });
  const preview = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(preview).toContainText(
    "Отсутствующие в CSV списки и их задачи не восстанавливаются",
  );
  await expect(preview).toContainText(
    "после последней выгруженной даты новые вхождения не создаются",
  );
});
