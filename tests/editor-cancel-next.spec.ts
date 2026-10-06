import { test, expect } from "@playwright/test";

test("отмена и Escape подтверждают потерю черновика, удерживают и возвращают фокус", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await input.fill("Не менять");
  await input.press("Enter");
  const trigger = page.getByRole("button", { name: "Не менять", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Редактор задачи" });
  const title = dialog.getByRole("textbox", { name: "Название", exact: true });
  await expect(title).toBeFocused();
  await title.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Удалить задачу" }),
  ).toBeFocused();
  await title.fill("Несохранённое");
  page.once("dialog", async (confirmation) => {
    expect(confirmation.message()).toContain("несохранённых");
    await confirmation.dismiss();
  });
  await title.press("Escape");
  await expect(title).toHaveValue("Несохранённое");
  await expect(dialog).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(title).toHaveValue("Не менять");
  await title.fill("   ");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("непустое название");
  await expect(dialog).toBeVisible();
});
