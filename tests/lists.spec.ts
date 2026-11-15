import { expect, test, type Page } from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn } from "./mail";

const someday = (page: Page) =>
  page.getByRole("region", { name: "Someday", exact: true });
const tab = (page: Page, name: string) =>
  someday(page).getByRole("tab", { name, exact: true });
const menuItem = (page: Page, name: string) =>
  page.getByRole("menuitem", { name, exact: true });

async function openMenu(page: Page, list: string) {
  await tab(page, list).click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
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

test("a user creates, renames, orders and deletes lists, writes tasks into them, and finds it all after a reload", async ({
  page,
}) => {
  const tabs = someday(page).getByRole("tab");
  await expect(tabs).toHaveText(["Inbox"]);
  await expect(tab(page, "Inbox")).toHaveAttribute("aria-selected", "true");

  await addTasks(page, ["Buy a lamp", "Read Dune"]);

  await tab(page, "Inbox").click();
  await menuItem(page, "New list").click();
  const name = someday(page).getByRole("textbox", { name: "New list" });
  await name.fill("Errands");
  await name.press("Enter");
  await expect(tab(page, "Errands")).toHaveAttribute("aria-selected", "true");
  await expect(
    someday(page).getByRole("button", { name: "Buy a lamp" }),
  ).toHaveCount(0);
  await addTasks(page, ["Post office"]);

  await openMenu(page, "Inbox");
  await menuItem(page, "New list").click();
  await name.fill("Trips");
  await name.press("Enter");

  await openMenu(page, "Errands");
  await menuItem(page, "Rename").click();
  const rename = someday(page).getByRole("textbox", { name: "List name" });
  await expect(rename).toHaveValue("Errands");
  await rename.fill("Chores");
  await rename.press("Enter");

  await openMenu(page, "Trips");
  await expect(menuItem(page, "Move down")).toBeDisabled();
  await menuItem(page, "Move up").click();
  await expect(tabs).toHaveText(["Inbox", "Trips", "Chores"]);

  await openMenu(page, "Trips");
  await menuItem(page, "Delete").click();
  await expect(tabs).toHaveText(["Inbox", "Chores"]);

  await openMenu(page, "Chores");
  await menuItem(page, "Delete").click();
  const confirm = page.getByRole("dialog", {
    name: "Delete “Chores” and its 1 task?",
  });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(tabs).toHaveText(["Inbox", "Chores"]);

  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(tabs).toHaveText(["Inbox", "Chores"]);
    if (!reload) await tab(page, "Inbox").click();
    await expect(tab(page, "Inbox")).toHaveAttribute("aria-selected", "true");
    await expect(
      someday(page).getByRole("button", { name: /^(Buy a lamp|Read Dune)$/ }),
    ).toHaveText(["Buy a lamp", "Read Dune"]);
    await tab(page, "Chores").click();
    await expect(
      someday(page).getByRole("button", { name: "Post office", exact: true }),
    ).toBeVisible();
  }

  await openMenu(page, "Chores");
  await menuItem(page, "Delete").click();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(tabs).toHaveText(["Inbox"]);

  await openMenu(page, "Inbox");
  await expect(menuItem(page, "Delete")).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(tabs).toHaveText(["Inbox"]);
  await expect(
    someday(page).getByRole("button", { name: "Post office" }),
  ).toHaveCount(0);
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
  const rename = someday(page).getByRole("textbox", { name: "Task title" });
  await rename.fill("Fix the car");
  await rename.press("Enter");
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
  for (const name of names) {
    await someday(page).getByRole("tab", { selected: true }).click();
    await menuItem(page, "New list").click();
    await someday(page).getByRole("textbox", { name: "New list" }).fill(name);
    await someday(page)
      .getByRole("textbox", { name: "New list" })
      .press("Enter");
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
  }

  const band = (await someday(page).boundingBox())!;
  const tabs = (await someday(page).getByRole("tablist").boundingBox())!;
  expect(tabs.y + tabs.height).toBeLessThanOrEqual(band.y + band.height);
  expect(band.height).toBe((await thursday.boundingBox())!.height);

  await tab(page, "Five").click();
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page.getByRole("heading", { name: "Week 47" })).toBeVisible();
  await expect(tab(page, "Five")).toHaveAttribute("aria-selected", "true");
});
