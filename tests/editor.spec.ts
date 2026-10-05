import { test, expect } from "@playwright/test";

test("редактор сохраняет буквальный текст, цвет и изменения после перезагрузки", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await input.fill("Черновик");
  await input.press("Enter");
  await page.getByRole("button", { name: "Черновик", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Редактор задачи" });
  await dialog
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("  План ✨  ");
  const notes =
    'Кавычки "да"\n<script>alert("нет")</script>\nhttps://example.invalid/личное';
  await dialog.getByRole("textbox", { name: "Заметка" }).fill(notes);
  await dialog.getByLabel("Цвет").selectOption("blue");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "План ✨", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Заметка" })).toHaveValue(
    notes,
  );
  await expect(dialog.getByLabel("Цвет")).toHaveValue("blue");
});
