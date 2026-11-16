import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn } from "./mail";

const region = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
const titles = (place: Locator) =>
  place.getByRole("button", {
    name: /^(?!Add task$|Edit |Delete |New list$|Edit lists$)/,
  });

const task = (place: Locator, name: string) =>
  place.getByRole("button", { name, exact: true });
const saved = (page: Page) =>
  page.waitForResponse((response) => response.request().method() === "POST");

async function addTasks(place: Locator, names: string[]) {
  await place.getByRole("button", { name: "Add task" }).first().click();
  const input = place.getByRole("textbox", { name: "New task" });
  for (const name of names) {
    await input.fill(name);
    await input.press("Enter");
    await expect(
      place.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await input.press("Escape");
}

async function point(
  target: Locator,
  side: "top" | "bottom" | "left" | "right" = "top",
) {
  const box = (await target.boundingBox())!;
  const x = side === "left" ? 0.2 : side === "right" ? 0.8 : 0.5;
  const y = side === "top" ? 0.25 : side === "bottom" ? 0.75 : 0.5;
  return { x: box.x + box.width * x, y: box.y + box.height * y };
}

async function drag(
  page: Page,
  source: Locator,
  target: Locator,
  side: "top" | "bottom" | "left" | "right",
  whileDragging?: () => Promise<void>,
) {
  const from = await point(source, "left");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const to = await point(target, side);
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await whileDragging?.();
  await Promise.all([saved(page), page.mouse.up()]);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinServerClock(page.context(), "2026-11-14T10:00:00+03:00");
  await signIn(page);
});

test("a user drags tasks within a day, between days and through a list, and finds the order after a reload", async ({
  page,
}) => {
  const today = region(page, "14 Today");
  const sunday = region(page, "15 Sun");
  const someday = region(page, "Someday");
  await addTasks(sunday, ["Gym", "Milk", "Call"]);

  const gym = await task(sunday, "Gym").boundingBox();
  await drag(page, task(sunday, "Call"), task(sunday, "Gym"), "top", async () =>
    expect(await task(sunday, "Gym").boundingBox()).toEqual(gym),
  );
  await expect(titles(sunday)).toHaveText(["Call", "Gym", "Milk"]);
  await expect(task(sunday, "Call")).toHaveAttribute("aria-pressed", "false");

  await drag(page, task(sunday, "Call"), task(sunday, "Milk"), "bottom");
  await expect(titles(sunday)).toHaveText(["Gym", "Milk", "Call"]);

  await drag(
    page,
    task(sunday, "Milk"),
    today.getByRole("button", { name: "Add task" }),
    "top",
  );
  await expect(titles(today)).toHaveText(["Milk"]);
  await drag(page, task(sunday, "Gym"), task(today, "Milk"), "bottom");
  await expect(titles(today)).toHaveText(["Milk", "Gym"]);

  await drag(
    page,
    task(sunday, "Call"),
    someday.getByRole("button", { name: "Add task" }),
    "top",
  );
  await expect(titles(someday)).toHaveText(["Call"]);
  await drag(page, task(someday, "Call"), task(today, "Milk"), "bottom");

  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(titles(today)).toHaveText(["Milk", "Call", "Gym"]);
    await expect(titles(sunday)).toHaveCount(0);
    await expect(titles(someday)).toHaveCount(0);
  }
});

test("while dragging, a user flips weeks at the window's edge, one week per pause, and drops the task in a later week", async ({
  page,
}) => {
  const week = page.getByRole("heading", { level: 1 });
  const sunday = region(page, "15 Sun");
  const someday = region(page, "Someday");
  await addTasks(sunday, ["Gym", "Milk"]);
  await addTasks(someday, ["Paint"]);
  const edge = { x: page.viewportSize()!.width - 12, y: 450 };

  const from = await point(task(sunday, "Milk"), "left");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(edge.x, edge.y, { steps: 12 });
  await expect(week).toHaveText("Week 47");
  const flipped = Date.now();
  await expect(week).toHaveText("Week 48");
  expect(Date.now() - flipped).toBeGreaterThan(700);
  const monday = region(page, "23 Mon");
  const to = await point(monday.getByRole("button", { name: "Add task" }));
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(1500);
  await expect(week).toHaveText("Week 48");
  await Promise.all([saved(page), page.mouse.up()]);
  await expect(titles(monday)).toHaveText(["Milk"]);

  const paint = await point(task(someday, "Paint"), "left");
  await page.mouse.move(paint.x, paint.y);
  await page.mouse.down();
  await page.mouse.move(12, edge.y, { steps: 12 });
  await expect(week).toHaveText("Week 47");
  const tuesday = region(page, "17 Tue");
  const back = await point(tuesday.getByRole("button", { name: "Add task" }));
  await page.mouse.move(back.x, back.y, { steps: 12 });
  await Promise.all([saved(page), page.mouse.up()]);
  await expect(titles(tuesday)).toHaveText(["Paint"]);
  await expect(titles(someday)).toHaveCount(0);

  await page.goto("/?week=2026-11-23");
  await expect(titles(region(page, "23 Mon"))).toHaveText(["Milk"]);
  await page.goto("/");
  await expect(titles(sunday)).toHaveText(["Gym"]);
  await expect(titles(someday)).toHaveCount(0);
  await expect(titles(region(page, "16 Mon"))).toHaveCount(0);
});

test("a user drags a list tab to reorder the lists, and finds the order after a reload", async ({
  page,
}) => {
  const someday = region(page, "Someday");
  const tabs = someday.getByRole("tab");
  for (const name of ["Errands", "Trips"]) {
    await someday.getByRole("button", { name: "New list" }).click();
    const input = someday.getByRole("textbox", { name: "New list" });
    await input.fill(name);
    await input.press("Enter");
    await expect(someday.getByRole("tab", { name })).toBeVisible();
  }
  await expect(tabs).toHaveText(["Inbox", "Errands", "Trips"]);

  await drag(page, tabs.nth(2), tabs.nth(0), "left");
  await expect(tabs).toHaveText(["Trips", "Inbox", "Errands"]);
  await expect(tabs.nth(1)).toBeEnabled();
  await drag(page, tabs.nth(1), tabs.nth(2), "right");
  await expect(tabs).toHaveText(["Trips", "Errands", "Inbox"]);

  await page.reload();
  await expect(tabs).toHaveText(["Trips", "Errands", "Inbox"]);
});

test.describe("on a touchscreen", () => {
  test.use({ hasTouch: true });

  async function touch(
    cdp: CDPSession,
    from: { x: number; y: number },
    to: { x: number; y: number },
    hold: number,
  ) {
    const point = (p: { x: number; y: number }) => ({
      touchPoints: [{ x: p.x, y: p.y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      ...point(from),
    });
    await new Promise((resolve) => setTimeout(resolve, hold));
    for (let step = 1; step <= 10; step++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        ...point({
          x: from.x + ((to.x - from.x) * step) / 10,
          y: from.y + ((to.y - from.y) * step) / 10,
        }),
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }

  test("a user long-presses a task to drag it to another day, while a quick swipe leaves it in place", async ({
    page,
  }) => {
    const today = region(page, "14 Today");
    const sunday = region(page, "15 Sun");
    await addTasks(sunday, ["Gym", "Milk"]);
    const cdp = await page.context().newCDPSession(page);
    const milk = sunday.getByRole("button", { name: "Milk", exact: true });
    const empty = today.getByRole("button", { name: "Add task" });

    await touch(cdp, await point(milk, "left"), await point(empty), 0);
    await expect(titles(today)).toHaveCount(0);
    await expect(titles(sunday)).toHaveText(["Gym", "Milk"]);

    const moved = saved(page);
    await touch(cdp, await point(milk, "left"), await point(empty), 500);
    await moved;
    await expect(titles(today)).toHaveText(["Milk"]);
    await page.reload();
    await expect(titles(today)).toHaveText(["Milk"]);
    await expect(titles(sunday)).toHaveText(["Gym"]);
  });
});
