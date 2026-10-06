import { test, expect } from "@playwright/test";

const header = "Date,Task,Notes,Checklist,Completed,List";

test("устаревший ответ поиска не перезаписывает результаты более нового запроса", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "staleness.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `${header}\n2040-01-01,Маркер план,,,FALSE,\n,Сторожевой маркер,,,FALSE,Идеи\n,Заметка план,,,FALSE,Личное`,
    ),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить импорт" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    let delayed = 1;
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = original.apply(this, args);
      const delayedRequest: {
        onsuccess: ((event: { target: unknown }) => void) | null;
        onerror: ((event: { target: unknown }) => void) | null;
        result: unknown;
        error: unknown;
      } = { onsuccess: null, onerror: null, result: null, error: null };
      request.addEventListener("success", () => {
        delayedRequest.result = request.result;
        const wait = delayed > 0 ? ((delayed -= 1), 3000) : 0;
        setTimeout(
          () => delayedRequest.onsuccess?.({ target: delayedRequest }),
          wait,
        );
      });
      request.addEventListener("error", () =>
        delayedRequest.onerror?.({ target: delayedRequest }),
      );
      return delayedRequest as unknown as IDBRequest<unknown[]>;
    };
  });
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Поиск задач" });
  await page.waitForTimeout(500);
  await search.getByLabel("Поиск по тексту", { exact: true }).fill("план");
  await expect(search).toContainText("Найдено: 2");
  await expect(search.getByRole("listitem")).toHaveCount(2);
  await page.waitForTimeout(3500);
  await expect(search).toContainText("Найдено: 2");
  await expect(search.getByRole("listitem")).toHaveCount(2);
  await expect(
    search.getByLabel("Поиск по тексту", { exact: true }),
  ).toHaveValue("план");
  await expect(
    search.getByRole("listitem").filter({ hasText: "Сторожевой маркер" }),
  ).toHaveCount(0);
});
