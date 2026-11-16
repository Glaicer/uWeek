import { expect, test, type Locator, type Page } from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn } from "./mail";

const band = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
const card = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true });
const items = (details: Locator) =>
  expect.poll(() =>
    details
      .getByRole("textbox", { name: "Checklist item" })
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      ),
  );

async function addTask(page: Page, day: string, title: string) {
  await band(page, day).getByRole("button", { name: "Add task" }).click();
  const input = band(page, day).getByRole("textbox", { name: "New task" });
  await input.fill(title);
  await input.press("Enter");
  await input.press("Escape");
  await expect(
    band(page, day).getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
}

async function open(page: Page, day: string, title: string) {
  await band(page, day)
    .getByRole("button", { name: `Open ${title}` })
    .click();
  await expect(card(page, title)).toBeVisible();
  return card(page, title);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinServerClock(page.context(), "2026-11-09T10:00:00+03:00");
  await signIn(page);
});

test("every field of the task card is saved and survives a reload", async ({
  page,
}) => {
  await addTask(page, "13 Fri", "Pack");
  let details = await open(page, "13 Fri", "Pack");

  await details.getByRole("textbox", { name: "Title" }).fill("Pack bags");
  await details.getByRole("textbox", { name: "Notes" }).fill("Light, one bag");
  await details.getByRole("radio", { name: "Green" }).check();
  const newItem = details.getByRole("textbox", { name: "New item" });
  for (const item of ["Tickets", "Passport", "Charger"]) {
    await newItem.fill(item);
    await newItem.press("Enter");
  }
  await expect(newItem).toBeFocused();
  await details.getByRole("checkbox", { name: "Passport" }).check();
  await details
    .getByRole("textbox", { name: "Checklist item" })
    .nth(2)
    .fill("Phone charger");
  await details.getByRole("button", { name: "Delete Tickets" }).click();
  await details.getByRole("button", { name: "Move Phone charger up" }).click();
  await details.getByRole("textbox", { name: "Date" }).fill("2026-11-10");
  await details.getByRole("button", { name: "Done" }).click();
  await expect(details).toHaveCount(0);

  const row = band(page, "10 Tue").getByRole("button", {
    name: "Pack bags",
    exact: true,
  });
  await expect(
    band(page, "13 Fri").getByRole("button", { name: "Pack bags" }),
  ).toHaveCount(0);
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(row).toHaveAccessibleDescription("Green, Has notes");
    details = await open(page, "10 Tue", "Pack bags");
    await expect(details.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Pack bags",
    );
    await expect(details.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Light, one bag",
    );
    await expect(details.getByRole("radio", { name: "Green" })).toBeChecked();
    await items(details).toEqual(["Phone charger", "Passport"]);
    await expect(
      details.getByRole("checkbox", { name: "Passport" }),
    ).toBeChecked();
    await expect(
      details.getByRole("checkbox", { name: "Phone charger" }),
    ).not.toBeChecked();
    await expect(details.getByRole("textbox", { name: "Date" })).toHaveValue(
      "2026-11-10",
    );
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
  }

  details = await open(page, "10 Tue", "Pack bags");
  await details.getByRole("radio", { name: "No color" }).check();
  await details.getByRole("textbox", { name: "Notes" }).fill("");
  await details.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(row).toHaveAccessibleDescription("");
});

test("Escape closes the card and keeps what was typed; a failed save keeps the card open", async ({
  page,
}) => {
  await addTask(page, "13 Fri", "Gym");
  let details = await open(page, "13 Fri", "Gym");
  await details.getByRole("textbox", { name: "Notes" }).fill("Legs day");
  await details.getByRole("textbox", { name: "New item" }).fill("Towel");

  const actions = (url: URL) => url.pathname === "/";
  await page.route(actions, (route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
  await page.keyboard.press("Escape");
  await expect(details.getByRole("alert")).toHaveText(
    "Couldn't save. Try again.",
  );
  await expect(details.getByRole("textbox", { name: "Notes" })).toHaveValue(
    "Legs day",
  );

  await page.unroute(actions);
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await page.reload();
  details = await open(page, "13 Fri", "Gym");
  await expect(details.getByRole("textbox", { name: "Notes" })).toHaveValue(
    "Legs day",
  );
  await items(details).toEqual(["Towel"]);
});

test("a task moves into a list and back onto a date from its card with the keyboard", async ({
  page,
}) => {
  await addTask(page, "13 Fri", "Read Dune");
  const openButton = band(page, "13 Fri").getByRole("button", {
    name: "Open Read Dune",
  });
  await openButton.focus();
  await page.keyboard.press("Enter");
  const details = card(page, "Read Dune");
  const moveTo = details.getByRole("combobox", { name: "Move to" });
  await moveTo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Date" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(moveTo).toHaveText("Inbox");
  await expect(details.getByRole("textbox", { name: "Date" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);

  const inList = band(page, "Someday").getByRole("button", {
    name: "Read Dune",
    exact: true,
  });
  await page.reload();
  await expect(inList).toBeVisible();
  await expect(
    band(page, "13 Fri").getByRole("button", { name: "Read Dune" }),
  ).toHaveCount(0);

  await band(page, "Someday")
    .getByRole("button", { name: "Open Read Dune" })
    .focus();
  await page.keyboard.press("Enter");
  await moveTo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Inbox" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(details.getByRole("textbox", { name: "Date" })).toHaveValue(
    "2026-11-09",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    band(page, "09 Today").getByRole("button", {
      name: "Read Dune",
      exact: true,
    }),
  ).toBeVisible();
  await expect(inList).toHaveCount(0);
});

test("a task is deleted from its card", async ({ page }) => {
  await addTask(page, "13 Fri", "Old plan");
  const details = await open(page, "13 Fri", "Old plan");
  await details.getByRole("button", { name: "Delete task" }).click();
  await expect(details).toHaveCount(0);
  const row = band(page, "13 Fri").getByRole("button", { name: "Old plan" });
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
});
