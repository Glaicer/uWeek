import { test, expect } from "@playwright/test";

test("сохранение редактора, открытого из поиска, возвращает фокус в обновлённый результат", async ({
  page,
}) => {
  await page.goto("/");
  const input = page
    .locator(".day")
    .first()
    .getByRole("textbox", { name: /Новая задача/ });
  await input.fill("Фокус поиска");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Фокус поиска", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Поиск", exact: true }).press("Enter");
  const search = page.getByRole("dialog", { name: "Поиск задач", exact: true });
  await search.getByLabel("Поиск по тексту").fill("Фокус поиска");
  await search
    .getByRole("button", { name: "Фокус поиска", exact: true })
    .press("Enter");
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await editor
    .getByLabel("Название", { exact: true })
    .fill("Фокус поиска изменён");
  await editor
    .getByRole("button", { name: "Сохранить", exact: true })
    .press("Enter");
  const result = search.getByRole("button", {
    name: "Фокус поиска изменён",
    exact: true,
  });
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
  await expect(search.getByLabel("Поиск по тексту")).toHaveValue(
    "Фокус поиска",
  );
});
