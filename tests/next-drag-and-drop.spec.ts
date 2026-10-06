import { test, expect, type Page, type Locator } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
});

async function add(page: Page, section: Locator, titles: string[]) {
  for (const title of titles) {
    const input = section.getByRole("textbox", { name: /Новая задача/ });
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  }
}

async function drag(
  page: Page,
  source: Locator,
  target: Locator,
  after = false,
) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 12,
    from.y + from.height / 2,
    { steps: 5 },
  );
  const x = to.x + to.width / 2;
  const y = to.y + to.height * (after ? 0.8 : 0.2);
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.move(x, y);
  await page.mouse.up();
}

test("pointer reorder preserves hidden completed slots in days and lists", async ({
  page,
}) => {
  await page.goto("/");
  for (const section of [
    page.locator(".day").first(),
    page.getByRole("region", { name: "Список: Личное", exact: true }),
  ]) {
    await add(page, section, ["Первый", "Скрытый", "Последний"]);
    await section
      .getByRole("checkbox", { name: "Выполнена: Скрытый", exact: true })
      .check();
    await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
    await page
      .getByRole("checkbox", { name: "Скрыть выполненные", exact: true })
      .check();
    await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
    await drag(
      page,
      section.locator(".task-title").filter({ hasText: "Последний" }),
      section.locator(".task-row").filter({ hasText: "Первый" }),
    );
    await expect(page.getByRole("status")).toHaveText("Перемещение сохранено");
    await expect(
      section.locator(".task-row:not([hidden]) .task-title"),
    ).toHaveText(["Последний", "Первый"]);
    await page.reload();
    await expect(
      section.locator(".task-row:not([hidden]) .task-title"),
    ).toHaveText(["Последний", "Первый"]);
    await page
      .getByRole("checkbox", { name: "Скрыть выполненные", exact: true })
      .uncheck();
    await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
    await expect(section.locator(".task-title")).toHaveText([
      "Последний",
      "Скрытый",
      "Первый",
    ]);
    await expect(
      section.getByRole("checkbox", {
        name: "Выполнена: Скрытый",
        exact: true,
      }),
    ).toBeChecked();
  }
});
