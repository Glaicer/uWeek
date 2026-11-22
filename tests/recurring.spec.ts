import { expect, test, type Page } from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn } from "./mail";

const band = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
const task = (page: Page, day: string, title: string) =>
  band(page, day).getByRole("button", { name: title, exact: true });
const card = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true });

async function addTask(page: Page, day: string, title: string) {
  await band(page, day).getByRole("button", { name: "Add task" }).click();
  const input = band(page, day).getByRole("textbox", { name: "New task" });
  await input.fill(title);
  await input.press("Enter");
  await input.press("Escape");
  await expect(task(page, day, title)).toBeVisible();
}

async function open(page: Page, day: string, title: string) {
  await band(page, day)
    .getByRole("button", { name: `Edit ${title}` })
    .click();
  await expect(card(page, title)).toBeVisible();
  return card(page, title);
}

async function choose(page: Page, combobox: string, option: string) {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const week = [
  "09 Today",
  "10 Tue",
  "11 Wed",
  "12 Thu",
  "13 Fri",
  "14 Sat",
  "15 Sun",
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinServerClock(page.context(), "2026-11-09T10:00:00+03:00");
  await signIn(page);
});

test("a daily series: complete one occurrence, rename this and following, delete the series but keep what was done", async ({
  page,
}) => {
  await addTask(page, "10 Tue", "Stretch");
  let details = await open(page, "10 Tue", "Stretch");
  await choose(page, "Repeat", "Daily");
  await details.getByRole("button", { name: "Done" }).click();
  await expect(details).toHaveCount(0);

  await expect(
    band(page, "09 Today").getByRole("button", { name: "Stretch" }),
  ).toHaveCount(0);
  for (const day of week.slice(1))
    await expect(task(page, day, "Stretch")).toHaveAccessibleDescription(
      "Repeats",
    );

  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST",
  );
  await task(page, "12 Thu", "Stretch").click();
  await saved;
  await expect(task(page, "12 Thu", "Stretch")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(task(page, "12 Thu", "Stretch")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(task(page, "11 Wed", "Stretch")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  details = await open(page, "13 Fri", "Stretch");
  await details.getByRole("textbox", { name: "Title" }).fill("Stretch 10 min");
  await details.getByRole("button", { name: "Done" }).click();
  await page
    .getByRole("dialog", { name: /^Change “Stretch”/ })
    .getByRole("button", { name: "This and following" })
    .click();
  await expect(details).toHaveCount(0);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    for (const day of week.slice(1, 4))
      await expect(task(page, day, "Stretch")).toBeVisible();
    for (const day of week.slice(4))
      await expect(task(page, day, "Stretch 10 min")).toBeVisible();
  }

  await band(page, "10 Tue")
    .getByRole("button", { name: "Delete Stretch" })
    .click();
  await page
    .getByRole("dialog", { name: /^Delete “Stretch”/ })
    .getByRole("button", { name: "This and following" })
    .click();
  await band(page, "13 Fri")
    .getByRole("button", { name: "Delete Stretch 10 min" })
    .click();
  await page
    .getByRole("dialog", { name: /^Delete “Stretch 10 min”/ })
    .getByRole("button", { name: "This and following" })
    .click();
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    for (const day of week.filter((day) => day !== "12 Thu"))
      await expect(
        band(page, day).getByRole("button", { name: /^Stretch/ }),
      ).toHaveCount(0);
    await expect(task(page, "12 Thu", "Stretch")).toHaveAccessibleDescription(
      "",
    );
  }
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(
    band(page, "16 Mon").getByRole("button", { name: /^Stretch/ }),
  ).toHaveCount(0);
});

test("one occurrence is deleted on its own; a missed one moves to today and says which day it is from", async ({
  page,
}) => {
  await addTask(page, "10 Tue", "Water plants");
  const details = await open(page, "10 Tue", "Water plants");
  await choose(page, "Repeat", "Daily");
  await details.getByRole("button", { name: "Done" }).click();
  await expect(task(page, "11 Wed", "Water plants")).toBeVisible();

  await band(page, "12 Thu")
    .getByRole("button", { name: "Delete Water plants" })
    .click();
  await page
    .getByRole("dialog", { name: /^Delete “Water plants”/ })
    .getByRole("button", { name: "This task" })
    .click();
  await expect(task(page, "12 Thu", "Water plants")).toHaveCount(0);
  await expect(task(page, "13 Fri", "Water plants")).toBeVisible();

  await pinServerClock(page.context(), "2026-11-11T10:00:00+03:00");
  await page.reload();
  const today = band(page, "11 Today").getByRole("button", {
    name: "Water plants",
    exact: true,
  });
  await expect(today).toHaveCount(2);
  await expect(today.first()).toHaveAccessibleDescription(
    "Repeats, from 10 November",
  );
  await expect(today.last()).toHaveAccessibleDescription("Repeats");
  await expect(task(page, "10 Tue", "Water plants")).toHaveCount(0);
  await expect(task(page, "12 Thu", "Water plants")).toHaveCount(0);
  await expect(task(page, "13 Fri", "Water plants")).toBeVisible();
});

test("marking a checklist item of one occurrence saves it without asking about the series", async ({
  page,
}) => {
  await addTask(page, "10 Tue", "Trip");
  let details = await open(page, "10 Tue", "Trip");
  await choose(page, "Repeat", "Daily");
  const newItem = details.getByRole("textbox", { name: "New item" });
  await newItem.fill("Tickets");
  await newItem.press("Enter");
  await details.getByRole("button", { name: "Done" }).click();
  await expect(details).toHaveCount(0);

  details = await open(page, "11 Wed", "Trip");
  await details.getByRole("checkbox", { name: "Tickets" }).check();
  await details.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog", { name: /^Change/ })).toHaveCount(0);
  await expect(details).toHaveCount(0);

  await page.reload();
  details = await open(page, "11 Wed", "Trip");
  await expect(
    details.getByRole("checkbox", { name: "Tickets" }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  details = await open(page, "12 Thu", "Trip");
  await expect(
    details.getByRole("checkbox", { name: "Tickets" }),
  ).not.toBeChecked();
});

test("a monthly task on the last day of a 30-day month asks whether to keep the 30th or follow the month's end", async ({
  page,
}) => {
  await page.goto("/?week=2026-11-30");
  await addTask(page, "30 Mon", "Pay rent");
  const details = await open(page, "30 Mon", "Pay rent");
  await choose(page, "Repeat", "Monthly");
  await expect(page.getByRole("combobox", { name: "Repeat on" })).toHaveText(
    "The 30th",
  );
  await choose(page, "Repeat on", "The last day of the month");
  await details.getByRole("button", { name: "Done" }).click();
  await expect(details).toHaveCount(0);

  await page.goto("/?week=2026-12-28");
  await expect(task(page, "31 Thu", "Pay rent")).toBeVisible();
  await expect(task(page, "30 Wed", "Pay rent")).toHaveCount(0);
});

test("a monthly task on the 31st asks where shorter months put it", async ({
  page,
}) => {
  await page.goto("/?week=2026-12-28");
  await addTask(page, "31 Thu", "Backup");
  const details = await open(page, "31 Thu", "Backup");
  await choose(page, "Repeat", "Monthly");
  await expect(
    page.getByRole("combobox", { name: "In shorter months" }),
  ).toHaveText("Last day of shorter months");
  await choose(page, "In shorter months", "1st of the next month");
  await details.getByRole("button", { name: "Done" }).click();
  await expect(details).toHaveCount(0);

  await page.goto("/?week=2027-03-01");
  await expect(task(page, "01 Mon", "Backup")).toBeVisible();
  await page.goto("/?week=2027-02-22");
  await expect(task(page, "28 Sun", "Backup")).toHaveCount(0);
});
