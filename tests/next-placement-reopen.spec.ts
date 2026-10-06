import { chromium, test, expect } from "@playwright/test";

test("keyboard placement and order on 360px survive closing and reopening the same IndexedDB profile", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const profile = testInfo.outputPath("profile");
  let context = await chromium.launchPersistentContext(profile, {
    viewport: { width: 360, height: 760 },
  });
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(testInfo.project.use.baseURL!);
    const source = page.locator(".day").first();
    const input = source.getByRole("textbox", { name: /Новая задача/ });
    await input.focus();
    await page.keyboard.type("Клавиатурный перенос");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    const id = await source
      .locator("[data-task-id]")
      .getAttribute("data-task-id");
    const destination = page.getByRole("region", {
      name: "Список: Личное",
      exact: true,
    });
    await destination.getByRole("textbox", { name: /Новая задача/ }).focus();
    await page.keyboard.type("Сосед");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await source
      .getByRole("button", { name: "Клавиатурный перенос", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    const editor = page.getByRole("dialog");
    await editor.getByLabel("Размещение", { exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await expect(
      editor.getByLabel("Список задачи", { exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      editor
        .getByLabel("Список задачи", { exact: true })
        .locator("option:checked"),
    ).toHaveText("Личное");
    await editor
      .getByRole("button", { name: "Сохранить", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(editor).toHaveCount(0);
    await expect(destination.locator(".task-title")).toHaveText([
      "Сосед",
      "Клавиатурный перенос",
    ]);
    await expect(
      destination.getByRole("button", {
        name: "Клавиатурный перенос",
        exact: true,
      }),
    ).toBeFocused();
    const up = destination.getByRole("button", {
      name: "Выше: Клавиатурный перенос",
      exact: true,
    });
    await up.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Порядок сохранён");
    await expect(destination.locator(".task-title")).toHaveText([
      "Клавиатурный перенос",
      "Сосед",
    ]);
    for (const button of await destination
      .locator(".task-order button")
      .all()) {
      const size = await button.boundingBox();
      expect(size!.width).toBeGreaterThanOrEqual(44);
      expect(size!.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await context.close();
    context = await chromium.launchPersistentContext(profile);
    page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(testInfo.project.use.baseURL!);
    const reopened = page.getByRole("region", {
      name: "Список: Личное",
      exact: true,
    });
    await expect(reopened.locator(".task-title")).toHaveText([
      "Клавиатурный перенос",
      "Сосед",
    ]);
    await expect(reopened.locator("[data-task-id]").first()).toHaveAttribute(
      "data-task-id",
      id!,
    );
    await expect(page.locator(".day .task-row")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
