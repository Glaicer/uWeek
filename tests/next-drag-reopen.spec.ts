import { chromium, test, expect } from "@playwright/test";

test("pointer placements and full task content survive closing and reopening the browser profile", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const profile = testInfo.outputPath("profile");
  let context = await chromium.launchPersistentContext(profile, {
    viewport: { width: 1400, height: 1400 },
  });
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(testInfo.project.use.baseURL!);
    const source = page.locator(".day").first();
    const target = page.getByRole("region", {
      name: "Список: Личное",
      exact: true,
    });
    for (const [section, title] of [
      [source, "Содержимое"],
      [target, "Сосед"],
    ] as const) {
      await section.getByRole("textbox", { name: /Новая задача/ }).fill(title);
      await section
        .getByRole("textbox", { name: /Новая задача/ })
        .press("Enter");
      await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    }
    const id = await source.locator(".task-row").getAttribute("data-task-id");
    await source
      .getByRole("button", { name: "Содержимое", exact: true })
      .click();
    const editor = page.getByRole("dialog");
    await editor
      .getByLabel("Заметка", { exact: true })
      .fill("Строка 1\nСтрока 2 🧭");
    await editor
      .getByRole("combobox", { name: "Цвет", exact: true })
      .selectOption("blue");
    await editor.getByLabel("Выполнена", { exact: true }).check();
    await editor.getByRole("button", { name: "Добавить пункт" }).click();
    await editor
      .getByRole("textbox", { name: "Текст пункта 1", exact: true })
      .fill("Незавершённый шаг");
    await editor
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    const box = (await target.locator(".task-row").boundingBox())!;
    await source
      .getByRole("button", { name: "Содержимое", exact: true })
      .dragTo(target.locator(".task-row"), {
        targetPosition: { x: box.width / 2, y: box.height / 4 },
      });
    await expect(page.getByRole("status")).toHaveText("Перемещение сохранено");
    await expect(target.locator(".task-title")).toHaveText([
      "Содержимое",
      "Сосед",
    ]);
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
      "Содержимое",
      "Сосед",
    ]);
    await expect(page.locator(".day .task-row")).toHaveCount(0);
    await expect(reopened.locator(".task-row").first()).toHaveAttribute(
      "data-task-id",
      id!,
    );
    await expect(
      reopened.getByRole("checkbox", {
        name: "Выполнена: Содержимое",
        exact: true,
      }),
    ).toBeChecked();
    await reopened
      .getByRole("button", { name: "Содержимое", exact: true })
      .click();
    const saved = page.getByRole("dialog");
    await expect(saved.getByLabel("Заметка", { exact: true })).toHaveValue(
      "Строка 1\nСтрока 2 🧭",
    );
    await expect(
      saved.getByRole("combobox", { name: "Цвет", exact: true }),
    ).toHaveValue("blue");
    await expect(saved.getByLabel("Выполнена", { exact: true })).toBeChecked();
    await expect(
      saved.getByRole("textbox", { name: "Текст пункта 1", exact: true }),
    ).toHaveValue("Незавершённый шаг");
    await expect(
      saved.getByRole("checkbox", { name: "Выполнен пункт 1", exact: true }),
    ).not.toBeChecked();
  } finally {
    await context.close();
  }
});
