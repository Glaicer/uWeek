import { expect, test, type Page } from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn } from "./mail";

const header = "Date,Task,Notes,Checklist,Completed,List\n";
const file = {
  name: "tweek.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(
    header +
      "2026-12-08,Imported day,,,true,\n" +
      ",Imported list,,,false,Travel\n" +
      ",Imported list,,,false,Travel\n" +
      ",,,,,\n",
  ),
};

async function openImport(page: Page) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("link", { name: "Import from Tweek" }).click();
  await expect(
    page.getByRole("heading", { name: "Import from Tweek" }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await pinServerClock(page.context(), "2026-11-09T10:00:00+03:00");
  await signIn(page);
  await page.goto("/?week=2026-12-07");
});

test("choose, preview, confirm and repeat a CSV without leaving the selected week", async ({
  page,
}) => {
  await openImport(page);
  await expect(page.getByLabel("Tweek CSV file")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Choose CSV file" }),
  ).toBeVisible();
  await page.getByLabel("Tweek CSV file").setInputFiles(file);
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("3 tasks");
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("Travel");
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("1 exact duplicate");
  await page.getByRole("link", { name: "Back to planner" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Week 50");
  await expect(
    page.getByRole("button", { name: "Imported day", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Travel" })).toHaveCount(0);

  await openImport(page);
  await page.getByLabel("Tweek CSV file").setInputFiles(file);
  await page
    .getByRole("button", { name: "Import 3 tasks", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Added 3 tasks and 1 list.",
  );
  await page.getByRole("link", { name: "Back to planner" }).click();
  await expect(page).toHaveURL(/\?week=2026-12-07$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Week 50");
  await expect(
    page.getByRole("button", { name: "Imported day", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Travel" }).click();
  await expect(
    page.getByRole("button", { name: "Imported list", exact: true }),
  ).toHaveCount(2);

  await openImport(page);
  await page.getByLabel("Tweek CSV file").setInputFiles(file);
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("Already imported");
  await page.getByRole("button", { name: "Import again", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Added 0 tasks and 0 lists. This file was already imported.",
  );
  await page.getByRole("link", { name: "Back to planner" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Week 50");
  await page.reload();
  await page.getByRole("tab", { name: "Travel" }).click();
  await expect(
    page.getByRole("button", { name: "Imported list", exact: true }),
  ).toHaveCount(2);
});

test("the styled chooser works on mobile and an invalid replacement clears its preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openImport(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose CSV file" }).click();
  await (await chooser).setFiles(file);
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );

  await page.getByLabel("Tweek CSV file").setInputFiles({
    ...file,
    buffer: Buffer.from(
      header + ",Valid,,,false,New list\n,Invalid,,item,false,\n",
    ),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Record 3: Non-empty Checklist",
  );
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Import \d/ })).toHaveCount(0);

  await page.getByLabel("Tweek CSV file").setInputFiles({
    ...file,
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "5 MiB",
  );
  await page.getByRole("link", { name: "Back to planner" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Week 50");
  await expect(page.getByRole("tab", { name: "New list" })).toHaveCount(0);
});

test("a 5 MiB CSV crosses the server upload boundary and imports successfully", async ({
  page,
}) => {
  await openImport(page);
  const start = Buffer.from(header + "2026-12-08,Large notes,");
  const end = Buffer.from(",,false,\n");
  await page.getByLabel("Tweek CSV file").setInputFiles({
    ...file,
    buffer: Buffer.concat([
      start,
      Buffer.alloc(5 * 1024 * 1024 - start.length - end.length, "a"),
      end,
    ]),
  });
  await expect(
    page.getByRole("region", { name: "Import preview" }),
  ).toContainText("1 task");
  await page
    .getByRole("button", { name: "Import 1 task", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Added 1 task and 0 lists.",
  );
});
