import { test, expect } from "@playwright/test";

test("synthetic CSV search pages all matches in date/container/manual order with at most 50 result rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  const dated = Array.from(
    { length: 1000 },
    (_, index) => `2040-01-01,Набор ${index},,,FALSE,`,
  );
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "pagination.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Date,Task,Notes,Checklist,Completed,List",
        ",Набор идеи,,,FALSE,Идеи",
        ...dated,
        "2039-12-31,Набор ранний второй,,,FALSE,",
        ",Набор личное,,,TRUE,Личное",
        "2039-12-30,Набор ранний первый,,,FALSE,",
        ",Набор входящие,,,FALSE,Входящие",
      ].join("\n"),
    ),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить импорт" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Поиск задач" });
  const query = search.getByLabel("Поиск по тексту", { exact: true });
  await query.fill("набор");
  await expect(search).toContainText("Найдено: 1005");
  const previous = search.getByRole("button", {
    name: "Предыдущая страница",
    exact: true,
  });
  const next = search.getByRole("button", {
    name: "Следующая страница",
    exact: true,
  });
  await expect(previous).toBeDisabled();
  const names: string[] = [];
  for (let number = 1; number <= 21; number++) {
    await expect(search).toContainText(`Страница ${number} из 21`);
    await expect(search.getByRole("listitem")).toHaveCount(
      number === 21 ? 5 : 50,
    );
    names.push(
      ...(await search
        .getByRole("listitem")
        .locator("button:first-child")
        .allTextContents()),
    );
    if (number < 21) {
      await next.focus();
      await page.keyboard.press("Enter");
    }
  }
  expect(names).toEqual([
    "Набор ранний первый",
    "Набор ранний второй",
    ...Array.from({ length: 1000 }, (_, index) => `Набор ${index}`),
    "Набор входящие",
    "Набор личное",
    "Набор идеи",
  ]);
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(search).toContainText("Страница 20 из 21");
  await query.fill("Набор личное");
  await expect(search).toContainText("Страница 1 из 1");
  await expect(search.getByRole("listitem")).toHaveCount(1);
  expect(
    await search.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Поиск", exact: true }),
  ).toBeFocused();
});
