import { test, expect, type Page, type Locator } from "@playwright/test";

async function add(page: Page, section: Locator, titles: string[]) {
  for (const title of titles) {
    const input = section.getByRole("textbox", { name: /Новая задача/ });
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  }
}

async function drop(
  page: Page,
  source: Locator,
  target: Locator,
  after = false,
) {
  await source.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 15,
    from.y + from.height / 2,
    { steps: 5 },
  );
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * (after ? 0.8 : 0.2);
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.move(x, y);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Перемещение сохранено");
}

test("day/list and list/list drops support before, after and container append", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 1400 });
  await page.goto("/");
  const day = page.locator(".day").first();
  const personal = page.getByRole("region", {
    name: "Список: Личное",
    exact: true,
  });
  const ideas = page.getByRole("region", { name: "Список: Идеи", exact: true });
  await add(page, day, ["Перенос", "Дневная"]);
  await add(page, personal, ["Первая", "Вторая"]);
  await add(page, ideas, ["Идея"]);
  await drop(
    page,
    day.getByRole("button", { name: "Перенос", exact: true }),
    personal.locator(".task-row").filter({ hasText: "Первая" }),
    true,
  );
  await expect(personal.locator(".task-title")).toHaveText([
    "Первая",
    "Перенос",
    "Вторая",
  ]);
  await drop(
    page,
    personal.getByRole("button", { name: "Перенос", exact: true }),
    ideas.locator(".task-row"),
  );
  await expect(ideas.locator(".task-title")).toHaveText(["Перенос", "Идея"]);
  await drop(
    page,
    ideas.getByRole("button", { name: "Перенос", exact: true }),
    day.getByRole("heading"),
  );
  await expect(day.locator(".task-title")).toHaveText(["Дневная", "Перенос"]);
  await drop(
    page,
    day.getByRole("button", { name: "Дневная", exact: true }),
    day.getByRole("heading"),
  );
  await expect(day.locator(".task-title")).toHaveText(["Перенос", "Дневная"]);
  const empty = page.locator(".day").nth(2);
  await drop(
    page,
    day.getByRole("button", { name: "Перенос", exact: true }),
    empty.getByRole("heading"),
  );
  await expect(empty.locator(".task-title")).toHaveText(["Перенос"]);
  await page.reload();
  await expect(empty.locator(".task-title")).toHaveText(["Перенос"]);
  await expect(day.locator(".task-title")).toHaveText(["Дневная"]);
  await expect(personal.locator(".task-title")).toHaveText([
    "Первая",
    "Вторая",
  ]);
  await expect(ideas.locator(".task-title")).toHaveText(["Идея"]);
});

test("Escape and an outside drop do not change placement, order or saved state", async ({
  page,
}) => {
  await page.goto("/");
  const source = page.locator(".day").first();
  const destination = page.locator(".day").nth(1);
  await add(page, source, ["Первая", "Вторая"]);
  for (const cancel of [true, false]) {
    const status = await page.getByRole("status").textContent();
    const from = (await source
      .getByRole("button", { name: "Первая", exact: true })
      .boundingBox())!;
    const to = (await (
      cancel
        ? destination.getByRole("heading")
        : page.getByRole("heading", { level: 1 })
    ).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      from.x + from.width / 2 + 15,
      from.y + from.height / 2,
      { steps: 5 },
    );
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 10,
    });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2);
    await expect(source.locator(".task-title")).toHaveText([
      "Первая",
      "Вторая",
    ]);
    await expect(destination.locator(".task-title")).toHaveCount(0);
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText(status!);
    await page.reload();
    await expect(source.locator(".task-title")).toHaveText([
      "Первая",
      "Вторая",
    ]);
    await expect(destination.locator(".task-title")).toHaveCount(0);
  }
});
