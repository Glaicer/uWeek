import { expect, test } from "@playwright/test";
import { signIn } from "./mail";

test("the current week shows the month, ISO week number and six columns with today highlighted", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-14T10:00:00+03:00"));
  await signIn(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "November 2026 W46",
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "9 Nov Mon",
    "10 Nov Tue",
    "11 Nov Wed",
    "12 Nov Thu",
    "13 Nov Fri",
    "14 Nov Today",
    "15 Nov Sun",
  ]);

  const saturday = page.getByRole("heading", { name: "14 Nov Today" });
  await expect(saturday).toHaveAttribute("aria-current", "date");
  await expect(page.locator("[aria-current]")).toHaveCount(1);

  const friday = await page
    .getByRole("heading", { name: "13 Nov Fri" })
    .boundingBox();
  const sat = await saturday.boundingBox();
  const sun = await page
    .getByRole("heading", { name: "15 Nov Sun" })
    .boundingBox();
  expect(sat!.x).toBeGreaterThan(friday!.x);
  expect(sun!.x).toBe(sat!.x);
  expect(sun!.y).toBeGreaterThan(sat!.y);
});

test("the week number follows ISO 8601 across the new year", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2027-01-01T10:00:00+03:00"));
  await signIn(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "December 2026 W53",
  );
  await expect(
    page.getByRole("heading", { name: "1 Jan Today" }),
  ).toBeVisible();
});
