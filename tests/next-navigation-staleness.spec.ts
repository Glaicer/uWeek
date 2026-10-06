import { test, expect } from "@playwright/test";

test("устаревший ответ чтения не возвращает интерфейс к прежней неделе после быстрых переходов", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "5 октября 2026 – 11 октября 2026",
  );
  await page.evaluate(() => {
    const original = IDBIndex.prototype.getAll;
    let delayed = 1;
    IDBIndex.prototype.getAll = function (...args) {
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
  await page.getByRole("button", { name: "Предыдущая неделя" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Следующая неделя" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "5 октября 2026 – 11 октября 2026",
  );
  await page.waitForTimeout(3500);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "5 октября 2026 – 11 октября 2026",
  );
  await expect(
    page.getByRole("region", { name: "понедельник, 5 октября" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "5 октября 2026 – 11 октября 2026",
  );
});
