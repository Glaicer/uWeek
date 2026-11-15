import { expect, test, type Locator } from "@playwright/test";
import { pinServerClock } from "./clock";
import { signIn } from "./mail";

const bands = [
  "09 Mon",
  "10 Tue",
  "11 Wed",
  "12 Thu",
  "13 Fri",
  "14 Today",
  "15 Sun",
  "Someday",
];

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

test("the current week is a two-page spread with today highlighted", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinServerClock(page.context(), "2026-11-14T10:00:00+03:00");
  await signIn(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Week 46");
  await expect(
    page.getByText("9–15 November 2026", { exact: true }),
  ).toBeVisible();
  for (const name of ["Previous week", "Today", "Next week"])
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["Menu", "New task"])
    await expect(page.getByRole("button", { name })).toBeEnabled();

  await expect(page.getByRole("heading", { level: 2 })).toHaveText(bands);

  const saturday = page.getByRole("heading", { name: "14 Today" });
  await expect(saturday).toHaveAttribute("aria-current", "date");
  await expect(page.locator("[aria-current]")).toHaveCount(1);

  const band = (name: string) =>
    page.getByRole("region", { name, exact: true });
  const pairs = [
    ["09 Mon", "13 Fri"],
    ["10 Tue", "14 Today"],
    ["11 Wed", "15 Sun"],
    ["12 Thu", "Someday"],
  ];
  for (const [left, right] of pairs) {
    const l = await box(band(left));
    const r = await box(band(right));
    expect(r.x).toBeGreaterThan(l.x + l.width / 2);
    expect(r.y).toBe(l.y);
    expect(r.height).toBe(l.height);
  }
});

test("a narrow screen shows one page: the days in order, then Someday", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await pinServerClock(page.context(), "2026-11-14T10:00:00+03:00");
  await signIn(page);

  let previous = await box(
    page.getByRole("region", { name: bands[0], exact: true }),
  );
  for (const name of bands.slice(1)) {
    const current = await box(page.getByRole("region", { name, exact: true }));
    expect(current.x).toBe(previous.x);
    expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height);
    previous = current;
  }
  expect(previous.x + previous.width).toBeLessThanOrEqual(360);
});

test("the week number follows ISO 8601 across the new year", async ({
  page,
}) => {
  await pinServerClock(page.context(), "2027-01-01T10:00:00+03:00");
  await signIn(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Week 53");
  await expect(
    page.getByText(/^28 December 2026\s?–\s?3 January 2027$/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "01 Today" })).toBeVisible();
});
