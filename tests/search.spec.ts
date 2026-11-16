import { expect, test, type Page } from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn } from "./mail";

const band = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

async function addTask(page: Page, place: string, title: string) {
  const region = band(page, place);
  await region.getByRole("button", { name: "Add task" }).click();
  const input = region.getByRole("textbox", { name: "New task" });
  await input.fill(title);
  await input.press("Enter");
  await input.press("Escape");
  await expect(
    region.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
}

async function search(page: Page, query: string) {
  await page.getByRole("button", { name: "Search tasks", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search tasks" });
  await dialog.getByRole("searchbox", { name: "Search tasks" }).fill(query);
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinServerClock(page.context(), "2026-11-09T10:00:00+03:00");
  await signIn(page);
});

test("search opens from the header, finds a future task and highlights it on its week", async ({
  page,
}) => {
  await page.goto("/?week=2026-12-07");
  await addTask(page, "08 Tue", "Orchid care");
  await page.goto("/");
  const dialog = await search(page, "oRcHiD");
  await expect(
    dialog.getByRole("link", { name: "Orchid care", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".scratch/yourweek-cloud/issues/09-screenshots/search-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
  await page.screenshot({
    path: ".scratch/yourweek-cloud/issues/09-screenshots/search-360.png",
    fullPage: true,
  });
  await dialog.getByRole("link", { name: "Orchid care", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Week 50");
  const found = band(page, "08 Tue").getByRole("button", {
    name: "Orchid care",
    exact: true,
  });
  await expect(found).toHaveAttribute("aria-current", "true");
  await expect(found).toBeFocused();
  await expect(found).toBeInViewport();
  await page.screenshot({
    path: ".scratch/yourweek-cloud/issues/09-screenshots/highlight-360.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const edit = band(page, "08 Tue").getByRole("button", {
    name: "Edit Orchid care",
  });
  const remove = band(page, "08 Tue").getByRole("button", {
    name: "Delete Orchid care",
  });
  await page.mouse.move(0, 0);
  await expect(found).toBeFocused();
  await expect(edit).toHaveCSS("opacity", "0");
  await expect(remove).toHaveCSS("opacity", "0");
  await found.hover();
  await expect(edit).toHaveCSS("opacity", "1");
  await expect(remove).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(edit).toHaveCSS("opacity", "0");
  await expect(remove).toHaveCSS("opacity", "0");
  await page.screenshot({
    path: ".scratch/yourweek-cloud/issues/09-screenshots/highlight-1440.png",
    fullPage: true,
  });
});

test("search pages through results, resets for a new query, and lists a series only once", async ({
  page,
}) => {
  for (let index = 0; index < 21; index++)
    await addTask(page, "Someday", `Result ${String(index).padStart(2, "0")}`);
  const dialog = await search(page, "Result");
  await expect(dialog.getByRole("link")).toHaveCount(20);
  await dialog.getByRole("button", { name: "Next results" }).click();
  await expect(dialog.getByRole("link")).toHaveCount(1);
  await expect(
    dialog.getByRole("link", { name: "Result 20", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Next results" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Previous results" }).click();
  await expect(dialog.getByRole("link")).toHaveCount(20);
  await dialog.getByRole("searchbox").fill("No match");
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    dialog.getByText("No tasks found.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await addTask(page, "10 Tue", "Daily stretch");
  await band(page, "10 Tue")
    .getByRole("button", { name: "Edit Daily stretch" })
    .click();
  await page.getByRole("combobox", { name: "Repeat", exact: true }).click();
  await page.getByRole("option", { name: "Daily", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Daily stretch", exact: true })
    .getByRole("button", { name: "Done" })
    .click();
  const series = await search(page, "stretch");
  await expect(series.getByRole("link")).toHaveCount(1);
  await series
    .getByRole("link", { name: "Daily stretch", exact: true })
    .click();
  await expect(
    band(page, "10 Tue").getByRole("button", {
      name: "Daily stretch",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "true");
});

test("notes search selects the task's list even when another list was selected", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New list", exact: true }).click();
  const input = page.getByRole("textbox", { name: "New list" });
  await input.fill("Garden");
  await input.press("Enter");
  await expect(page.getByRole("tab", { name: "Garden" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await addTask(page, "Someday", "Buy supplies");
  await band(page, "Someday")
    .getByRole("button", { name: "Edit Buy supplies" })
    .click();
  const details = page.getByRole("dialog", {
    name: "Buy supplies",
    exact: true,
  });
  await details.getByRole("textbox", { name: "Notes" }).fill("Orchid food");
  await details.getByRole("button", { name: "Done" }).click();
  await page.getByRole("tab", { name: "Inbox" }).click();
  const dialog = await search(page, "ORCHID");
  await dialog.getByRole("link", { name: "Buy supplies", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Garden" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    band(page, "Someday").getByRole("button", {
      name: "Buy supplies",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "true");
  await page.getByRole("tab", { name: "Inbox" }).click();
  const again = await search(page, "ORCHID");
  await again.getByRole("link", { name: "Buy supplies", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Garden" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    band(page, "Someday").getByRole("button", {
      name: "Buy supplies",
      exact: true,
    }),
  ).toBeFocused();
});

test("another user cannot find a task or navigate to it using its search link", async ({
  page,
  browser,
}) => {
  await addTask(page, "09 Today", "Private orchid");
  const dialog = await search(page, "orchid");
  const href = await dialog
    .getByRole("link", { name: "Private orchid", exact: true })
    .getAttribute("href");
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    timezoneId: "Europe/Moscow",
  });
  try {
    await pinServerClock(context, "2026-11-09T10:00:00+03:00");
    const other = await context.newPage();
    await signIn(other);
    const empty = await search(other, "orchid");
    await expect(
      empty.getByText("No tasks found.", { exact: true }),
    ).toBeVisible();
    await expect(empty.getByRole("link")).toHaveCount(0);
    await other.goto(href!);
    await expect(
      other.getByRole("button", { name: "Private orchid", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
