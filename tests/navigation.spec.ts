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
  await expect(page.locator("[aria-current]:visible")).toHaveCount(0);

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

test("the calendar button opens a month calendar below the button and picks a whole week", async ({
  page,
}) => {
  await pinServerClock(page.context(), "2026-11-14T10:00:00+03:00");
  await signIn(page);

  const goTo = page.getByRole("button", { name: "Go to week" });
  await goTo.click();
  const picker = page.getByRole("dialog", { name: "Go to week" });
  await expect(picker).toBeVisible();
  const button = (await goTo.boundingBox())!;
  expect((await picker.boundingBox())!.y).toBeGreaterThanOrEqual(
    button.y + button.height,
  );
  const month = picker.getByRole("combobox", { name: "Month" });
  const year = picker.getByRole("combobox", { name: "Year" });
  await expect(month).toHaveText("November");
  await expect(year).toHaveText("2026");
  await expect(
    picker.getByRole("link", { name: "Week 46, 9–15 November 2026" }),
  ).toHaveAttribute("aria-current", "true");

  await month.click();
  const months = page.getByRole("listbox", { name: "Month" });
  await expect(month).toHaveAttribute("aria-expanded", "true");
  await expect(months.getByRole("option", { name: "November" })).toBeFocused();
  const monthButton = (await month.boundingBox())!;
  expect((await months.boundingBox())!.y).toBeGreaterThanOrEqual(
    monthButton.y + monthButton.height,
  );
  for (let step = 0; step < 9; step++) await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(months).toBeHidden();
  await expect(month).toHaveText("February");
  await expect(month).toBeFocused();
  await expect(picker).toBeVisible();

  await year.click();
  await page
    .getByRole("listbox", { name: "Year" })
    .getByRole("option", { name: "2028" })
    .click();
  await expect(year).toHaveText("2028");
  await expect(picker.getByRole("link")).toHaveCount(5);
  await picker.getByRole("link", { name: /^Week 9, 28 February/ }).click();

  await expect(page).toHaveURL(/\/\?week=2028-02-28$/);
  await expect(heading(page)).toHaveText("Week 9");
  await expect(picker).toBeHidden();
});

test("the arrow keys page through weeks unless the user is typing or a popup is open", async ({
  page,
}) => {
  await pinServerClock(page.context(), "2026-11-14T10:00:00+03:00");
  await signIn(page);
  await expect(heading(page)).toHaveText("Week 46");

  const next = page.getByRole("link", { name: "Next week" });
  await page.keyboard.down("ArrowRight");
  await expect(next).toHaveAttribute("data-pressed", "true");
  await expect(next).toHaveCSS("background-color", "rgb(227, 232, 236)");
  await expect(heading(page)).toHaveText("Week 46");
  await page.keyboard.up("ArrowRight");
  await expect(page).toHaveURL(/\/\?week=2026-11-16$/);
  await expect(next).not.toHaveAttribute("data-pressed");
  await expect(heading(page)).toHaveText("Week 47");
  await page.keyboard.press("ArrowLeft");
  await expect(heading(page)).toHaveText("Week 46");
  await page.keyboard.press("ArrowLeft");
  await expect(heading(page)).toHaveText("Week 45");

  await day(page, "04 Wed").getByRole("button", { name: "Add task" }).click();
  const input = day(page, "04 Wed").getByRole("textbox", { name: "New task" });
  await input.fill("Typing");
  await input.press("ArrowLeft");
  await input.press("ArrowRight");
  await expect(heading(page)).toHaveText("Week 45");
  await input.press("Escape");

  await page.getByRole("button", { name: "Go to week" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(heading(page)).toHaveText("Week 45");
  await expect(page).toHaveURL(/\/\?week=2026-11-02$/);
  await page.keyboard.press("Escape");

  const today = page.getByRole("link", { name: "Today", exact: true });
  await page.keyboard.down("KeyT");
  await expect(today).toHaveAttribute("data-pressed", "true");
  await page.keyboard.up("KeyT");
  await expect(page).toHaveURL(/\/$/);
  await expect(heading(page)).toHaveText("Week 46");
});

test("the keyboard alone opens the calendar, picks a month and a year and opens a week", async ({
  page,
}) => {
  await pinServerClock(page.context(), "2026-11-14T10:00:00+03:00");
  await signIn(page);
  await expect(heading(page)).toHaveText("Week 46");

  const button = page.getByRole("button", { name: "Go to week" });
  const picker = page.getByRole("dialog", { name: "Go to week" });
  await page.keyboard.down("KeyG");
  await expect(button).toHaveAttribute("data-pressed", "true");
  await expect(picker).toBeHidden();
  await page.keyboard.up("KeyG");
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("link", { name: /^Week 46,/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(picker.getByRole("link", { name: /^Week 47,/ })).toBeFocused();

  await page.keyboard.press("KeyM");
  const months = page.getByRole("listbox", { name: "Month" });
  await expect(months.getByRole("option", { name: "November" })).toBeFocused();
  for (let step = 0; step < 9; step++) await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(months).toBeHidden();
  await expect(picker.getByRole("combobox", { name: "Month" })).toHaveText(
    "February",
  );

  await page.keyboard.press("KeyY");
  const years = page.getByRole("listbox", { name: "Year" });
  await expect(years.getByRole("option", { name: "2026" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(picker.getByRole("combobox", { name: "Year" })).toHaveText(
    "2028",
  );

  await page.keyboard.press("ArrowDown");
  await expect(
    picker.getByRole("link", { name: /^Week 5, 31 January/ }),
  ).toBeFocused();
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowDown");
  await expect(
    picker.getByRole("link", { name: /^Week 9, 28 February/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/\?week=2028-02-28$/);
  await expect(heading(page)).toHaveText("Week 9");
  await expect(picker).toBeHidden();
});
