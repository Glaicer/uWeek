import { test, expect } from "@playwright/test";

test("обновление схемы версии 1 сохраняет существующие задачи и списки", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.route("**/*", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await page.goto("/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("yourweek", 1);
      request.onupgradeneeded = () => {
        const tasks = request.result.createObjectStore("tasks", {
          keyPath: "id",
        });
        tasks.createIndex("date", "placement.date");
        tasks.add({
          id: "old-task",
          title: "Задача до обновления",
          completed: false,
          placement: { date: "2026-10-05" },
          order: 0,
        });
        const lists = request.result.createObjectStore("lists", {
          keyPath: "id",
        });
        lists.add({ id: "old-list", title: "Мой список", order: 0 });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.unroute("**/*");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "5 октября 2026 – 11 октября 2026",
  );
  await expect(page.getByRole("listitem")).toHaveText("Задача до обновления");
  await expect(page.getByRole("heading", { name: "Мой список" })).toBeVisible();
  await page.getByLabel("Начало недели").selectOption("0");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "4 октября 2026 – 10 октября 2026",
  );
  await page.getByRole("button", { name: "Следующая неделя" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "11 октября 2026 – 17 октября 2026",
  );
  await page.getByRole("button", { name: "Предыдущая неделя" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "4 октября 2026 – 10 октября 2026",
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "4 октября 2026 – 10 октября 2026",
  );
  await expect(page.getByRole("listitem")).toHaveText("Задача до обновления");
  await expect(page.getByRole("heading", { name: "Мой список" })).toBeVisible();
  await expect(page.getByLabel("Начало недели")).toHaveValue("0");
});

for (const [timezoneId, range, today] of [
  [
    "Pacific/Kiritimati",
    "12 октября 2026 – 18 октября 2026",
    "понедельник, 12 октября",
  ],
  [
    "America/Los_Angeles",
    "5 октября 2026 – 11 октября 2026",
    "воскресенье, 11 октября",
  ],
] as const) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test("сегодня определяется локальным календарём, не UTC", async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date("2026-10-12T00:30:00Z"));
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(range);
      await expect(
        page
          .getByRole("region", { name: today })
          .getByText("Сегодня", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Следующая неделя" }).click();
      await page.getByRole("button", { name: "Сегодня", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(range);
    });
  });
}

test.describe("America/Los_Angeles — переход летнего времени", () => {
  test.use({ timezoneId: "America/Los_Angeles" });
  test("каждая неделя содержит семь последовательных календарных дней", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-03-08T12:00:00-07:00"));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "2 марта 2026 – 8 марта 2026",
    );
    await expect(page.locator(".day h2")).toHaveText([
      "понедельник, 2 марта",
      "вторник, 3 марта",
      "среда, 4 марта",
      "четверг, 5 марта",
      "пятница, 6 марта",
      "суббота, 7 марта",
      "воскресенье, 8 марта",
    ]);
    await page.getByRole("button", { name: "Следующая неделя" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "9 марта 2026 – 15 марта 2026",
    );
  });
});
