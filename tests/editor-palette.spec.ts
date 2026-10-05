import { test, expect } from "@playwright/test";

test("мобильный редактор использует фиксированную палитру и не загружает ссылки из текста", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await input.fill("<img src=https://example.invalid/title> ✨");
  await input.press("Enter");
  const trigger = page.getByRole("button", {
    name: "<img src=https://example.invalid/title> ✨",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const notes =
    '<img src="https://example.invalid/note">\n<script>window.bad=true</script>\n<xml>Привет</xml>\nhttps://example.invalid/link';
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(page.url()).origin)
      requests.push(request.url());
  });
  await dialog.getByRole("textbox", { name: "Заметка" }).fill(notes);
  const color = dialog.getByLabel("Цвет");
  await expect(color.locator("option")).toHaveText([
    "Без цвета",
    "Красный",
    "Оранжевый",
    "Жёлтый",
    "Зелёный",
    "Синий",
    "Фиолетовый",
  ]);
  for (const value of [
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "",
  ]) {
    await color.selectOption(value);
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await trigger.click();
    await expect(color).toHaveValue(value);
    await expect(dialog.getByRole("textbox", { name: "Заметка" })).toHaveValue(
      notes,
    );
  }
  await expect(
    page.locator(".task-editor img, .task-editor script, .task-editor a"),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(360);
});
