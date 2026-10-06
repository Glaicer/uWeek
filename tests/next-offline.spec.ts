import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { chromium, expect, test, type Locator } from "@playwright/test";

const url = "http://127.0.0.1:4204";

function startNextServer(port: number) {
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const output: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => output.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => output.push(chunk));
  const serverURL = `http://127.0.0.1:${port}`;
  const ready = (async () => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (child.exitCode !== null)
        throw new Error(
          `next start завершился раньше готовности: ${Buffer.concat(output).toString()}`,
        );
      const ok = await fetch(`${serverURL}/sw.js`)
        .then((response) => response.ok)
        .catch(() => false);
      if (ok) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(
      `next start не ответил на запросы: ${Buffer.concat(output).toString()}`,
    );
  })();
  let closed: Promise<void> | undefined;
  return {
    url: serverURL,
    ready,
    output: () => Buffer.concat(output).toString(),
    close: () =>
      (closed ??= new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
        const signal = (name: NodeJS.Signals) => {
          try {
            process.kill(-child.pid!, name);
          } catch {
            child.kill(name);
          }
        };
        signal("SIGTERM");
        setTimeout(() => signal("SIGKILL"), 5000).unref();
      })),
  };
}

test("worker отдаётся с корректным типом и обновляемой политикой кэша", async ({
  request,
}) => {
  const worker = await request.get(`${url}/sw.js`);
  expect(worker.status()).toBe(200);
  expect(worker.headers()["content-type"]).toContain("application/javascript");
  const policy = worker.headers()["cache-control"] ?? "";
  const maxAge = /max-age=(\d+)/.exec(policy)?.[1];
  expect(policy).not.toContain("immutable");
  expect(maxAge === undefined || Number(maxAge) < 86400).toBe(true);

  const entry = await request.get(`${url}/index.html`);
  expect(entry.status()).toBe(200);
  expect(entry.headers()["content-type"]).toContain("text/html");
  const root = await request.get(`${url}/`);
  expect(await root.text()).toBe(await entry.text());
});

test("кэш оболочки согласован с HTML и не содержит лишних ресурсов", async ({
  page,
}) => {
  await page.goto(url);
  await expect(
    page.getByText("Готово к работе офлайн", { exact: true }),
  ).toBeVisible();

  const shell = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) =>
      name.startsWith("yourweek-shell:"),
    );
    const keys = await (await caches.open(names[0])).keys();
    return {
      names,
      paths: keys.map((request) => new URL(request.url).pathname),
    };
  });
  expect(shell.names).toHaveLength(1);

  const html = await page.evaluate(async () => {
    const name = (await caches.keys()).find((name) =>
      name.startsWith("yourweek-shell:"),
    );
    const response = await (
      await caches.open(name!)
    ).match(new URL("index.html", location.origin).href);
    return await response!.text();
  });
  const referenced = [
    ...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g),
  ].map((match) => match[1]);
  expect(referenced.length).toBeGreaterThan(0);
  for (const path of referenced) expect(shell.paths).toContain(path);

  const shellFiles = ["/index.html", "/LICENSE", "/THIRD_PARTY_NOTICES.md"];
  for (const path of shell.paths) {
    expect(shellFiles.includes(path) || path.startsWith("/_next/static/")).toBe(
      true,
    );
  }

  await page.evaluate(() => fetch("/sw.js").catch(() => null));
  await page.evaluate(() => fetch("/несуществующий-ресурс").catch(() => null));
  const after = await page.evaluate(async () => {
    const name = (await caches.keys()).find((name) =>
      name.startsWith("yourweek-shell:"),
    );
    return (await (await caches.open(name!)).keys()).length;
  });
  expect(after).toBe(shell.paths.length);
});

test("после остановки сервера и отключения сети доступен весь планер: записи, чек-листы, все переносы, поиск, CSV, экспорт и восстановление", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const server = await startNextServer(4205);
  await server.ready;
  const profile = testInfo.outputPath("offline-profile");
  let context = await chromium.launchPersistentContext(profile, {
    timezoneId: "Europe/Moscow",
  });
  const taskTitles = [
    "До остановки сервера",
    "Офлайн правка",
    "Офлайн выполненная",
    "Офлайн перенос",
    "Перетащенная офлайн",
    "Офлайн удаление",
    "Офлайн импорт",
  ];
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    const requests: string[] = [];
    context.on("request", (request) => requests.push(request.url()));
    await page.goto(`${server.url}/`);
    await expect(
      page.getByText("Готово к работе офлайн", { exact: true }),
    ).toBeVisible();
    const onlineInput = page
      .getByRole("textbox", { name: /Новая задача/ })
      .first();
    await onlineInput.fill(taskTitles[0]);
    await onlineInput.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    for (const title of taskTitles) {
      expect(requests.some((request) => request.includes(title))).toBe(false);
    }
    await context.close();

    await server.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "Europe/Moscow",
      offline: true,
    });
    page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(`${server.url}/`);
    await expect(page.getByText(taskTitles[0], { exact: true })).toBeVisible();

    const monday = page.locator('.day[data-date="2026-10-05"]');
    const tuesday = page.locator('.day[data-date="2026-10-06"]');
    const create = async (container: Locator, title: string) => {
      const box = container.getByRole("textbox", { name: /Новая задача/ });
      await box.fill(title);
      await box.press("Enter");
      await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    };
    await create(monday, taskTitles[1]);
    await create(monday, taskTitles[2]);
    await create(tuesday, taskTitles[3]);
    await create(monday, taskTitles[4]);
    await create(tuesday, taskTitles[5]);

    await monday
      .getByRole("checkbox", { name: `Выполнена: ${taskTitles[2]}` })
      .check();
    await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");

    await monday
      .getByRole("button", { name: taskTitles[1], exact: true })
      .click();
    const editor = page.getByRole("dialog", { name: "Редактор задачи" });
    await editor.getByLabel("Заметка", { exact: true }).fill("Офлайн заметка");
    await editor.getByLabel("Цвет").selectOption("blue");
    await editor.getByRole("button", { name: "Добавить пункт" }).click();
    await editor.getByLabel("Текст пункта 1").fill("Офлайн пункт");
    await editor.getByLabel("Выполнен пункт 1").check();
    await editor.getByRole("button", { name: "Сохранить" }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("Изменения сохранены");

    await page.getByRole("button", { name: `Ниже: ${taskTitles[1]}` }).click();
    await expect(page.getByRole("status")).toHaveText("Порядок сохранён");
    await expect(
      monday.getByRole("button", { name: `Ниже: ${taskTitles[4]}` }),
    ).toBeDisabled();
    await expect(monday.locator(".task-title")).toHaveText([
      taskTitles[0],
      taskTitles[2],
      taskTitles[1],
      taskTitles[4],
    ]);

    await tuesday
      .getByRole("button", { name: taskTitles[3], exact: true })
      .click();
    await editor.getByLabel("Размещение").selectOption("list");
    await editor.getByLabel("Список задачи").selectOption({ label: "Личное" });
    await editor.getByRole("button", { name: "Сохранить" }).click();
    await expect(editor).toHaveCount(0);
    const personal = page.getByRole("region", {
      name: "Список: Личное",
      exact: true,
    });
    await expect(
      personal.getByRole("button", { name: taskTitles[3], exact: true }),
    ).toBeVisible();
    await personal
      .getByRole("button", { name: taskTitles[3], exact: true })
      .click();
    await editor.getByLabel("Размещение").selectOption("date");
    await editor.getByLabel("Дата задачи").fill("2026-10-07");
    await editor.getByRole("button", { name: "Сохранить" }).click();
    await expect(editor).toHaveCount(0);
    await expect(
      page
        .locator('.day[data-date="2026-10-07"]')
        .getByRole("button", { name: taskTitles[3], exact: true }),
    ).toBeVisible();

    const source = monday.getByRole("button", {
      name: taskTitles[4],
      exact: true,
    });
    const target = monday.getByRole("button", {
      name: taskTitles[1],
      exact: true,
    });
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      from.x + from.width / 2 + 12,
      from.y + from.height / 2,
      { steps: 5 },
    );
    await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.2, {
      steps: 10,
    });
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText("Перемещение сохранено");
    await expect(monday.locator(".task-title")).toHaveText([
      taskTitles[0],
      taskTitles[2],
      taskTitles[4],
      taskTitles[1],
    ]);

    page.once("dialog", (dialog) => dialog.accept());
    await tuesday
      .getByRole("button", { name: taskTitles[5], exact: true })
      .click();
    await editor.getByRole("button", { name: "Удалить задачу" }).click();
    await expect(editor).toHaveCount(0);
    await expect(
      tuesday.getByRole("button", { name: taskTitles[5], exact: true }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Поиск", exact: true }).click();
    const search = page.locator(".task-search");
    await expect(search).toBeVisible();
    await search.getByRole("searchbox").fill("Офлайн");
    await expect(search.getByRole("status")).toHaveText("Найдено: 4");
    await search.getByRole("searchbox").fill(taskTitles[3]);
    await expect(search.getByRole("status")).toHaveText("Найдено: 1");
    await page.keyboard.press("Escape");
    await expect(search).toHaveCount(0);

    await page.getByLabel("Tweek CSV").setInputFiles({
      name: "offline.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Date,Task,Notes,Checklist,Completed,List\n,Офлайн импорт,,,FALSE,Идеи",
      ),
    });
    const importDialog = page.getByRole("dialog", { name: "Импорт CSV" });
    await expect(importDialog).toBeVisible();
    await importDialog
      .getByRole("button", { name: "Подтвердить импорт" })
      .click();
    await expect(page.locator(".feedback")).toContainText("Добавлено задач: 1");

    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Скачать резервную копию", exact: true })
      .click();
    const backup = JSON.parse(
      await readFile((await (await pending).path())!, "utf8"),
    );
    expect(backup.tasks).toHaveLength(6);
    expect(backup.format).toBe("yourweek-backup");

    await page.getByLabel("Восстановить JSON").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    const restoreDialog = page.getByRole("dialog", {
      name: "Восстановление копии",
    });
    await expect(restoreDialog).toBeVisible();
    await restoreDialog
      .getByRole("button", { name: "Заменить все данные" })
      .click();
    await expect(page.locator(".feedback")).toContainText(
      "Копия восстановлена",
    );
    await expect(page.locator(".day")).toHaveCount(7);
    await page.reload();
    await expect(page.getByText(taskTitles[0], { exact: true })).toBeVisible();
    await expect(
      page.getByText("Офлайн импорт", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
    const logs = server.output();
    for (const title of taskTitles) {
      expect(logs).not.toContain(title);
    }
  }
});
