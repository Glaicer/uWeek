import { test, expect } from "@playwright/test";

for (const width of [360, 1200]) {
  test(`все семь дней доступны при ширине ${width}, длинные задачи не обрезаются`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto("/");
    const days = page.locator(".day");
    await expect(days).toHaveCount(7);
    const title =
      "Очень длинная задача с деталями ".repeat(30) +
      "https://example.invalid/secret";
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("http://127.0.0.1:4171"))
        externalRequests.push(request.url());
    });
    const input = days.first().getByRole("textbox");
    await input.fill(title);
    await input.press("Enter");
    const task = days.first().getByRole("listitem");
    await expect(task.locator(".task-title")).toHaveText(title);
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    const first = (await days.nth(0).boundingBox())!;
    const last = (await days.nth(6).boundingBox())!;
    if (width >= 1200) {
      expect(last.y).toBe(first.y);
      expect(last.x).toBeGreaterThan(first.x);
      expect(last.width).toBeCloseTo(first.width, 0);
    } else {
      expect(last.x).toBe(first.x);
      expect(last.y).toBeGreaterThan(first.y);
    }
    for (const control of await page
      .locator("input:visible, button:visible")
      .all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    const unclipped = await task.evaluate(
      (element) => element.scrollHeight <= element.clientHeight,
    );
    expect(unclipped).toBe(true);
    expect(externalRequests).toEqual([]);
  });
}
