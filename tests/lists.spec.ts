import { expect, test, type Page } from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn } from "./mail";

const someday = (page: Page) =>
  page.getByRole("region", { name: "Someday", exact: true });
const tab = (page: Page, name: string) =>
  someday(page).getByRole("tab", { name, exact: true });

async function newList(page: Page, name: string) {
  await someday(page).getByRole("button", { name: "New list" }).click();
  const input = someday(page).getByRole("textbox", { name: "New list" });
  await input.fill(name);
  await input.press("Enter");
  await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
}

async function addTasks(page: Page, titles: string[]) {
  await someday(page).getByRole("button", { name: "Add task" }).click();
  const input = someday(page).getByRole("textbox", { name: "New task" });
  for (const title of titles) {
    await input.fill(title);
    await input.press("Enter");
    await expect(
      someday(page).getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
  }
  await input.press("Escape");
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinServerClock(page.context(), "2026-11-14T10:00:00+03:00");
  await signIn(page);
});

test("a user creates, renames and deletes lists, writes tasks into them, and finds it all after a reload", async ({
  page,
}) => {
  const tabs = someday(page).getByRole("tab");
  const button = (name: string) =>
    someday(page).getByRole("button", { name, exact: true });
  await expect(tabs).toHaveText(["Inbox"]);
  await expect(tab(page, "Inbox")).toHaveAttribute("aria-selected", "true");

  await addTasks(page, ["Buy a lamp", "Read Dune"]);
  await newList(page, "Errands");
  await expect(button("Buy a lamp")).toHaveCount(0);
  await addTasks(page, ["Post office"]);
  await newList(page, "Trips");

  await expect(button("Rename Errands")).toHaveCount(0);
  const manage = button("Edit lists");
  await manage.click();
  await expect(manage).toHaveAttribute("aria-pressed", "true");

  await button("Rename Errands").click();
  const rename = someday(page).getByRole("textbox", { name: "List name" });
  await expect(rename).toHaveValue("Errands");
  await rename.fill("Chores");
  await rename.press("Enter");
  await expect(tabs).toHaveText(["Inbox", "Chores", "Trips"]);

  await button("Delete Trips").click();
  await page
    .getByRole("dialog", { name: "Delete “Trips”?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(tabs).toHaveText(["Inbox", "Chores"]);

  await button("Delete Chores").click();
  const confirm = page.getByRole("dialog", {
    name: "Delete “Chores” and its 1 task?",
  });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(tabs).toHaveText(["Inbox", "Chores"]);

  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(tabs).toHaveText(["Inbox", "Chores"]);
    await tab(page, "Inbox").click();
    await expect(
      someday(page).getByRole("button", { name: /^(Buy a lamp|Read Dune)$/ }),
    ).toHaveText(["Buy a lamp", "Read Dune"]);
    await tab(page, "Chores").click();
    await expect(button("Post office")).toBeVisible();
  }

  await manage.click();
  await button("Delete Chores").click();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(tabs).toHaveText(["Inbox"]);
  await expect(tab(page, "Inbox")).toHaveAttribute("aria-selected", "true");
  await expect(button("Delete Inbox")).toHaveCount(0);

  await page.reload();
  await expect(tabs).toHaveText(["Inbox"]);
  await expect(button("Post office")).toHaveCount(0);
});

test("the list's tasks complete, rename and delete like a day's", async ({
  page,
}) => {
  await addTasks(page, ["Plant a tree", "Fix the bike"]);
  const row = (name: string) =>
    someday(page).getByRole("button", { name, exact: true });

  await row("Plant a tree").click();
  await someday(page)
    .getByRole("button", { name: "Edit Fix the bike" })
    .click();
  const card = page.getByRole("dialog", { name: "Fix the bike" });
  await card.getByRole("textbox", { name: "Title" }).fill("Fix the car");
  await card.getByRole("button", { name: "Done" }).click();
  await expect(row("Fix the car")).toBeVisible();
  await page.reload();

  await expect(row("Plant a tree")).toHaveAttribute("aria-pressed", "true");
  await someday(page)
    .getByRole("button", { name: "Delete Fix the car" })
    .click();
  await expect(row("Fix the car")).toHaveCount(0);
  await page.reload();
  await expect(row("Fix the car")).toHaveCount(0);
  await expect(row("Plant a tree")).toBeVisible();
});

test("many lists keep the Someday band level with the day facing it, and the picked list stays picked across weeks", async ({
  page,
}) => {
  const thursday = page.getByRole("region", { name: "12 Thu", exact: true });
  const names = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
  for (const name of names) await newList(page, name);

  const band = (await someday(page).boundingBox())!;
  const tabs = (await someday(page).getByRole("tablist").boundingBox())!;
  expect(tabs.y + tabs.height).toBeLessThanOrEqual(band.y + band.height);
  expect(band.height).toBe((await thursday.boundingBox())!.height);

  await tab(page, "Five").click();
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page.getByRole("heading", { name: "Week 47" })).toBeVisible();
  await expect(tab(page, "Five")).toHaveAttribute("aria-selected", "true");
});
