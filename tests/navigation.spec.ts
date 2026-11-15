import { expect, test, type Page } from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn, uniqueEmail } from "./mail";

const day = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const task = (page: Page, band: string, title: string | RegExp) =>
  day(page, band).getByRole("button", { name: title, exact: true });
const range = (page: Page, text: string) =>
  page.getByText(text, { exact: true });

async function addTask(page: Page, band: string, title: string) {
  await day(page, band).getByRole("button", { name: "Add task" }).click();
  const input = day(page, band).getByRole("textbox", { name: "New task" });
  await input.fill(title);
  await input.press("Enter");
  await input.press("Escape");
  await expect(task(page, band, title)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("a user pages through weeks, the URL keeps the week across a reload, and Today comes back", async ({
  page,
}) => {
  await pinServerClock(page.context(), "2026-11-14T10:00:00+03:00");
  await signIn(page);

  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(/\/\?week=2026-11-16$/);
  await expect(heading(page)).toHaveText("Week 47");
  await expect(range(page, "16–22 November 2026")).toBeVisible();
  await expect(page.locator("[aria-current]")).toHaveCount(0);

  await addTask(page, "18 Wed", "Dentist");
  await page.reload();
  await expect(heading(page)).toHaveText("Week 47");
  await expect(task(page, "18 Wed", "Dentist")).toBeVisible();

  await page.getByRole("link", { name: "Previous week" }).click();
  await expect(heading(page)).toHaveText("Week 46");
  await page.getByRole("link", { name: "Previous week" }).click();
  await expect(heading(page)).toHaveText("Week 45");
  await expect(range(page, "2–8 November 2026")).toBeVisible();

  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(heading(page)).toHaveText("Week 46");
  await expect(page.getByRole("heading", { name: "14 Today" })).toBeVisible();
});

test("a user starts the week on Sunday from the menu; columns and the week number follow", async ({
  page,
}) => {
  await pinServerClock(page.context(), "2026-11-15T10:00:00+03:00");
  await signIn(page);
  await expect(heading(page)).toHaveText("Week 46");

  await page.getByRole("button", { name: "Menu" }).click();
  const weekStart = page.getByRole("group", { name: "Week starts on" });
  await expect(
    weekStart.getByRole("button", { name: "Monday" }),
  ).toHaveAttribute("aria-pressed", "true");
  await weekStart.getByRole("button", { name: "Sunday" }).click();

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "15 Today",
    "16 Mon",
    "17 Tue",
    "18 Wed",
    "19 Thu",
    "20 Fri",
    "21 Sat",
    "Someday",
  ]);
  await expect(heading(page)).toHaveText("Week 47");
  await expect(range(page, "15–21 November 2026")).toBeVisible();

  const sunday = await day(page, "15 Today").boundingBox();
  const thursday = await day(page, "19 Thu").boundingBox();
  expect(thursday!.y).toBe(sunday!.y);
  expect(thursday!.x).toBeGreaterThan(sunday!.x);

  await page.reload();
  await expect(heading(page)).toHaveText("Week 47");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(
    weekStart.getByRole("button", { name: "Sunday" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("unfinished tasks from past days are waiting on today the next morning", async ({
  page,
}) => {
  await pinServerClock(page.context(), "2026-11-13T10:00:00+03:00");
  await signIn(page);
  await addTask(page, "13 Today", "Unfinished");
  await addTask(page, "13 Today", "Finished");
  await task(page, "13 Today", "Finished").click();
  await expect(task(page, "13 Today", "Finished")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await pinServerClock(page.context(), "2026-11-14T08:00:00+03:00");
  await page.reload();
  await expect(
    day(page, "14 Today").getByRole("button", {
      name: /^(Unfinished|Finished)$/,
    }),
  ).toHaveText(["Unfinished"]);
  await expect(
    day(page, "13 Fri").getByRole("button", {
      name: /^(Unfinished|Finished)$/,
    }),
  ).toHaveText(["Finished"]);
});

test("today follows the time zone the browser reported at the first sign-in", async ({
  browser,
}) => {
  const email = uniqueEmail();
  const evening = "2026-11-14T20:00:00Z";
  for (const timezoneId of ["Asia/Bangkok", "Europe/Moscow"]) {
    const context = await browser.newContext({ timezoneId });
    await pinServerClock(context, evening);
    const page = await context.newPage();
    await signIn(page, email);
    await expect(page.getByRole("heading", { name: "15 Today" })).toBeVisible();
    await context.close();
  }
});
