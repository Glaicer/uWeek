import { chromium, test, expect } from "@playwright/test";

test("повторное открытие профиля сохраняет переименованный список и его задачи без даты", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const profile = testInfo.outputPath("profile");
  let context = await chromium.launchPersistentContext(profile);
  try {
    let page = context.pages()[0];
    await page.goto(testInfo.project.use.baseURL!);
    let ideas = page.getByRole("region", { name: "Список: Идеи", exact: true });
    await ideas
      .getByRole("textbox", { name: "Новая задача: Идеи" })
      .fill("Когда будет время");
    await ideas
      .getByRole("textbox", { name: "Новая задача: Идеи" })
      .press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await ideas.getByRole("button", { name: "Переименовать список" }).click();
    await ideas
      .getByRole("textbox", { name: "Название списка", exact: true })
      .fill("Позже");
    await ideas.getByRole("button", { name: "Сохранить название" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Название списка сохранено",
    );
    await page.getByRole("button", { name: "Следующая неделя" }).click();
    await expect(
      page
        .getByRole("region", { name: "Список: Позже", exact: true })
        .getByRole("listitem"),
    ).toHaveText("Когда будет время");
    await context.close();
    context = await chromium.launchPersistentContext(profile);
    page = context.pages()[0];
    await page.goto(testInfo.project.use.baseURL!);
    ideas = page.getByRole("region", { name: "Список: Позже", exact: true });
    await expect(ideas.getByRole("listitem")).toHaveText("Когда будет время");
    await expect(page.locator(".week").getByRole("listitem")).toHaveCount(0);
    await page.getByRole("button", { name: "Предыдущая неделя" }).click();
    await expect(ideas.getByRole("listitem")).toHaveText("Когда будет время");
    await expect(page.locator(".week").getByRole("listitem")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
