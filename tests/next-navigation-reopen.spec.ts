import { chromium, test, expect } from "@playwright/test";

test("перезапуск сохраняет воскресное начало и далёкую неделю без сдвига дат между timezone", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const profile = testInfo.outputPath("profile");
  let context = await chromium.launchPersistentContext(profile, {
    timezoneId: "Pacific/Kiritimati",
  });
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+14:00"));
    await page.goto("http://127.0.0.1:4171");
    await page.getByLabel("Начало недели").selectOption("0");
    await page.getByLabel("Перейти к дате").fill("2040-01-01");
    await page.getByLabel("Перейти к дате").press("Enter");
    const input = page
      .getByRole("region", { name: "воскресенье, 1 января" })
      .getByRole("textbox");
    await input.fill("Первый день 2040");
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "America/Los_Angeles",
    });
    page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00-07:00"));
    await page.goto("http://127.0.0.1:4171");
    await expect(page.getByLabel("Начало недели")).toHaveValue("0");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "1 января 2040 – 7 января 2040",
    );
    await expect(
      page
        .getByRole("region", { name: "воскресенье, 1 января" })
        .getByRole("listitem")
        .locator(".task-title"),
    ).toHaveText("Первый день 2040");
    await page.getByRole("button", { name: "Сегодня", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "4 октября 2026 – 10 октября 2026",
    );
    await page.getByLabel("Перейти к дате").fill("2040-01-01");
    await page.getByLabel("Перейти к дате").press("Enter");
    await expect(page.getByRole("listitem").locator(".task-title")).toHaveText(
      "Первый день 2040",
    );
  } finally {
    await context.close();
  }
});

test("сегодня на 360px прокручивает к актуальной секции; клавиатура достигает всех команд", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.clock.setFixedTime(new Date("2026-10-11T12:00:00+03:00"));
  await page.goto("/");
  await expect(page.locator(".day")).toHaveCount(7);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Предыдущая неделя" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "28 сентября 2026 – 4 октября 2026",
  );
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Следующая неделя" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Сегодня", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".today")).toBeInViewport();
  await expect(
    page.getByRole("region", { name: "воскресенье, 11 октября" }),
  ).toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Перейти к дате")).toBeFocused();
  for (let step = 0; step < 5; step++) {
    await page.keyboard.press("Tab");
    if (
      await page
        .getByRole("button", { name: "Перейти", exact: true })
        .evaluate((button) => button === document.activeElement)
    )
      break;
  }
  await expect(
    page.getByRole("button", { name: "Перейти", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Начало недели")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("перезагрузка сохраняет даже первую открытую неделю после смены локального сегодня", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-11T23:59:00+03:00"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "5 октября 2026 – 11 октября 2026",
  );
  await page.clock.setFixedTime(new Date("2026-10-12T00:01:00+03:00"));
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "5 октября 2026 – 11 октября 2026",
  );
  await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "12 октября 2026 – 18 октября 2026",
  );
});
