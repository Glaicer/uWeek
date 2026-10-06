import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
});

for (const container of ["day", "list"]) {
  test(`keyboard order in ${container} keeps hidden completed slots and survives reopen`, async ({
    page,
  }) => {
    await page.goto("/");
    const section =
      container === "day"
        ? page.locator(".day").first()
        : page.getByRole("region", { name: "Список: Личное", exact: true });
    for (const title of ["Первый", "Скрытый", "Последний"]) {
      const input = section.getByRole("textbox", { name: /Новая задача/ });
      await input.fill(title);
      await input.press("Enter");
      await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    }
    await section
      .getByRole("checkbox", { name: "Выполнена: Скрытый", exact: true })
      .check();
    await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
    await page
      .getByRole("checkbox", { name: "Скрыть выполненные", exact: true })
      .check();
    await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
    await expect(
      section.getByRole("button", { name: "Выше: Первый", exact: true }),
    ).toBeDisabled();
    await expect(
      section.getByRole("button", { name: "Ниже: Последний", exact: true }),
    ).toBeDisabled();
    const down = section.getByRole("button", {
      name: "Ниже: Первый",
      exact: true,
    });
    await down.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Порядок сохранён");
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
    await section
      .getByRole("button", { name: "Выше: Первый", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("status")).toHaveText("Порядок сохранён");
    await expect(section.locator(".task-title")).toHaveText([
      "Последний",
      "Первый",
      "Скрытый",
    ]);
  });
}
