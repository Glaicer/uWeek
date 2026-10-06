import { chromium, expect, test } from "@playwright/test";

const url = "http://127.0.0.1:4171";
const bootError =
  "Локальная база недоступна. Задачи не загружены. Разрешите хранение данных в этом браузере и повторите попытку.";

const bootAlert = (page: import("@playwright/test").Page) =>
  page.getByRole("alert").filter({ hasText: "Локальная база недоступна" });

test("создание задачи в Next.js сохраняется после перезагрузки и повторного открытия профиля", async ({
  request,
}, testInfo) => {
  const profile = testInfo.outputPath("next-launch-profile");
  let context = await chromium.launchPersistentContext(profile, {
    timezoneId: "Europe/Moscow",
  });
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(url);
    const day = page.getByRole("region", { name: "понедельник, 5 октября" });
    const input = day.getByRole("textbox");
    await expect(input).toBeVisible();
    await input.fill("Задача из Next.js");
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await expect(day.getByRole("listitem").locator(".task-title")).toHaveText(
      "Задача из Next.js",
    );
    const response = await request.get(url);
    const html = await response.text();
    expect(html).toContain("Загрузка планера…");
    expect(html).not.toContain("Задача из Next.js");
    await page.reload();
    await expect(day.getByRole("listitem").locator(".task-title")).toHaveText(
      "Задача из Next.js",
    );
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "Europe/Moscow",
    });
    page = context.pages()[0];
    await page.goto(url);
    await expect(
      page
        .getByRole("region", { name: "понедельник, 5 октября" })
        .getByRole("listitem")
        .locator(".task-title"),
    ).toHaveText("Задача из Next.js");
    for (const title of ["Входящие", "Личное", "Идеи"]) {
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toHaveCount(1);
    }
  } finally {
    await context.close();
  }
});

test("до открытия базы показывается понятная загрузка, а не пустой планер", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.addInitScript(() => {
    const real = window.indexedDB;
    const pending = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest;
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get: () =>
        sessionStorage.getItem("next-launch-idb") === "real"
          ? real
          : { open: () => pending },
    });
  });
  await page.goto(url);
  await expect(page.getByRole("status")).toHaveText("Загрузка планера…");
  await expect(page.locator(".day")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Когда-нибудь" })).toHaveCount(
    0,
  );
  await expect(bootAlert(page)).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("next-launch-idb", "real"));
  await page.reload();
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await expect(input).toBeVisible();
});

test("недоступная база объясняет проблему, а повтор открывает планер", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.addInitScript(() => {
    const real = window.indexedDB;
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get: () =>
        sessionStorage.getItem("next-launch-idb") === "real" ? real : undefined,
    });
  });
  await page.goto(url);
  await expect(bootAlert(page)).toHaveText(bootError);
  await expect(
    page.getByRole("heading", { name: "YourWeek", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".day")).toHaveCount(0);
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(bootAlert(page)).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("next-launch-idb", "real"));
  await page.getByRole("button", { name: "Повторить" }).click();
  const input = page
    .getByRole("region", { name: "понедельник, 5 октября" })
    .getByRole("textbox");
  await expect(input).toBeVisible();
  for (const title of ["Входящие", "Личное", "Идеи"]) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(1);
  }
});

test("production-запуск без hydration, runtime и console ошибок при базовом цикле", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      problems.push(`console.${message.type()}: ${message.text()}`);
  });
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto(url);
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  await expect(input).toBeVisible();
  await input.fill("Проверка консоли");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await day.locator(".task-title").click();
  const editor = page.getByRole("dialog", { name: "Редактор задачи" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Цвет").selectOption("red");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Следующая неделя" }).click();
  await page.getByRole("button", { name: "Предыдущая неделя" }).click();
  await page.getByRole("button", { name: "Поиск" }).click();
  const search = page.locator(".task-search");
  await search.getByRole("searchbox").fill("Проверка консоли");
  await expect(search.getByRole("status")).toHaveText("Найдено: 1");
  await page.getByRole("button", { name: "Закрыть поиск" }).click();
  await page.reload();
  await expect(
    day.getByRole("button", { name: "Проверка консоли", exact: true }),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test("dev-маршрут real-storage seam недоступен в production", async ({
  request,
}) => {
  const response = await request.get(`${url}/dev-storage`);
  expect(response.status()).toBe(404);
});
