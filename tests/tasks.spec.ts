import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./mail";

const day = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
const task = (day: Locator, name: string) =>
  day.getByRole("button", { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date("2026-11-14T10:00:00+03:00"));
  await signIn(page);
});

test("a user writes tasks into empty rows, completes, renames and deletes them, and finds them after a reload", async ({
  page,
}) => {
  const friday = day(page, "13 Fri");
  await friday.getByRole("button", { name: "Add task" }).click();
  const input = friday.getByRole("textbox", { name: "New task" });
  await input.fill("Buy milk");
  await input.press("Enter");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await input.fill("Call mum");
  await input.press("Enter");
  await input.fill("Water plants");
  await input.press("Enter");
  await input.press("Enter");
  await expect(input).toHaveCount(0);

  await friday.getByRole("button", { name: "Add task" }).click();
  await friday.getByRole("textbox", { name: "New task" }).fill("Never mind");
  await friday.getByRole("textbox", { name: "New task" }).press("Escape");
  await expect(friday.getByRole("textbox")).toHaveCount(0);

  await task(friday, "Buy milk").click();
  await expect(task(friday, "Buy milk")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await friday.getByRole("button", { name: "Edit Call mum" }).click();
  const rename = friday.getByRole("textbox", { name: "Task title" });
  await rename.fill("Call dad");
  await rename.press("Enter");
  await expect(rename).toHaveCount(0);

  await friday.getByRole("button", { name: "Delete Water plants" }).click();

  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(
      friday.getByRole("button", {
        name: /^(Buy milk|Call dad|Water plants|Call mum)$/,
      }),
    ).toHaveText(["Buy milk", "Call dad"]);
    await expect(task(friday, "Buy milk")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(task(friday, "Call dad")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }

  await task(friday, "Buy milk").click();
  await expect(task(friday, "Buy milk")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.reload();
  await expect(task(friday, "Buy milk")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("facing days grow together and always keep an empty row under the last task", async ({
  page,
}) => {
  const monday = day(page, "09 Mon");
  const friday = day(page, "13 Fri");
  const before = (await friday.boundingBox())!.height;

  await friday.getByRole("button", { name: "Add task" }).click();
  const input = friday.getByRole("textbox", { name: "New task" });
  for (const title of ["One", "Two", "Three", "Four", "Five"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(task(friday, title)).toBeVisible();
  }
  await input.press("Escape");

  await expect(friday.getByRole("button", { name: "Add task" })).toBeVisible();
  const grown = (await friday.boundingBox())!.height;
  expect(grown).toBeGreaterThan(before);
  expect((await monday.boundingBox())!.height).toBe(grown);
});

test("New task starts typing in today's first empty row", async ({ page }) => {
  await page.getByRole("button", { name: "New task" }).click();
  await expect(
    day(page, "14 Today").getByRole("textbox", { name: "New task" }),
  ).toBeFocused();
});

test("a failed save is shown at the row and keeps the typed text", async ({
  page,
}) => {
  const friday = day(page, "13 Fri");
  await friday.getByRole("button", { name: "Add task" }).click();
  const input = friday.getByRole("textbox", { name: "New task" });

  const actions = (url: URL) => url.pathname === "/";
  await page.route(actions, (route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
  await input.fill("Never saved");
  await input.press("Enter");
  await friday.getByRole("button", { name: "Discard Never saved" }).click();
  await expect(friday.getByText("Never saved")).toHaveCount(0);

  await friday.getByRole("button", { name: "Add task" }).click();
  await input.fill("Buy milk");
  await input.press("Enter");
  const alert = friday.getByRole("alert");
  await expect(alert).toHaveText("Couldn't save. Try again");
  await expect(friday.getByText("Buy milk", { exact: true })).toBeVisible();

  await page.unroute(actions);
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(task(friday, "Buy milk")).toBeVisible();
  await expect(friday.getByRole("alert")).toHaveCount(0);
});
