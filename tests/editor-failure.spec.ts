import { test, expect } from "@playwright/test";

test("отмена реальной транзакции после успеха запроса оставляет черновик для повтора", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await input.fill("Сохранённая");
  await input.press("Enter");
  await page.getByRole("button", { name: "Сохранённая", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const notes = dialog.getByRole("textbox", { name: "Заметка" });
  const text = "Несохранённый черновик ✨\nВторая строка";
  await notes.fill(text);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.put = original;
      return request;
    };
  });
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Изменения не сохранены",
  );
  await expect(notes).toHaveValue(text);
  await expect(
    dialog.getByRole("button", { name: "Сохранить", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Сохранённая", exact: true }).click();
  await expect(notes).toHaveValue(text);
});
