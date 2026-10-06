import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { chromium, firefox, expect, test } from "@playwright/test";

const run = promisify(execFile);
const oldCommit = "8657507";
const port = 4207;
const url = `http://127.0.0.1:${port}/`;
const today = new Date("2026-10-05T12:00:00+03:00");
const csv =
  "Date,Task,Notes,Checklist,Completed,List\r\n2026-10-06,Импортированная задача,Заметка из CSV,,false,\r\n";

async function buildOldShell(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  await run(
    "bash",
    ["-c", `git archive ${oldCommit} | tar -x -C '${directory}'`],
    { cwd: process.cwd() },
  );
  await run("pnpm", ["install", "--frozen-lockfile", "--offline"], {
    cwd: directory,
  });
  await run("pnpm", ["build"], { cwd: directory });
  return join(directory, "dist");
}

function serveStatic(directory: string, serverPort: number) {
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url!, "http://localhost").pathname;
      try {
        const file = pathname === "/" ? "index.html" : pathname.slice(1);
        const content = await readFile(join(directory, file));
        const type = file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".html")
              ? "text/html"
              : "text/plain";
        response.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-store",
        });
        response.end(content);
      } catch {
        response.writeHead(404);
        response.end();
      }
    })();
  });
  const started = new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(serverPort, "127.0.0.1", () => resolve());
  });
  let closed: Promise<void> | undefined;
  return {
    started,
    close: () =>
      (closed ??= new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      })),
  };
}

function startNextServer(serverPort: number) {
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(serverPort)],
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
  const serverURL = `http://127.0.0.1:${serverPort}`;
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
    ready,
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

async function downloadBackup(
  page: import("@playwright/test").Page,
): Promise<string> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать резервную копию" }).click();
  const file = await download;
  return await readFile(await file.path(), "utf8");
}

for (const [name, engine] of [
  ["chromium", chromium],
  ["firefox", firefox],
] as const) {
  test(`${name}: профиль со старой оболочкой переходит на Next.js без очистки данных`, async () => {
    const testInfo = test.info();
    let nextServer: ReturnType<typeof startNextServer> | undefined;
    const oldDist = await buildOldShell(
      testInfo.outputPath(`old-shell-${name}`),
    );
    const oldServer = serveStatic(oldDist, port);
    await oldServer.started;
    const profile = testInfo.outputPath(`upgrade-profile-${name}`);
    let context = await engine.launchPersistentContext(profile, {
      timezoneId: "Europe/Moscow",
    });
    try {
      let page = context.pages()[0];
      await page.clock.setFixedTime(today);
      await page.goto(url);
      await expect(
        page.getByText("Готово к работе офлайн", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("script[src*='/_next/']")).toHaveCount(0);

      const day = page.getByRole("region", { name: "понедельник, 5 октября" });
      await day.getByRole("textbox").fill("Старая задача");
      await day.getByRole("textbox").press("Enter");
      await expect(page.getByRole("status")).toHaveText("Задача сохранена");

      await day.locator(".task-title").click();
      const editor = page.locator(".task-editor");
      await expect(editor).toBeVisible();
      await editor.locator('textarea[name="notes"]').fill("Старая заметка");
      await editor.locator('select[name="color"]').selectOption("blue");
      await editor.getByRole("button", { name: "Добавить пункт" }).click();
      await editor.getByLabel("Текст пункта 1").fill("Старый пункт");
      await editor.getByRole("button", { name: "Сохранить" }).click();
      await expect(editor).toHaveCount(0);

      await page.getByLabel("Название нового списка").fill("Работа");
      await page.getByRole("button", { name: "Добавить список" }).click();
      await expect(page.getByRole("status")).toHaveText("Список сохранён");
      const work = page.getByRole("region", { name: "Список: Работа" });
      await work.getByRole("textbox").fill("Задача в списке");
      await work.getByRole("textbox").press("Enter");
      await expect(page.getByRole("status")).toHaveText("Задача сохранена");

      await page.getByLabel("Перейти к дате").fill("2040-01-15");
      await page.getByRole("button", { name: "Перейти", exact: true }).click();
      await expect(page.getByLabel("Перейти к дате")).toHaveValue("2040-01-15");

      await page.getByLabel("Tweek CSV").setInputFiles({
        name: "synthetic.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf8"),
      });
      const importDialog = page.getByRole("dialog", { name: "Импорт CSV" });
      await expect(importDialog).toBeVisible();
      await importDialog
        .getByRole("button", { name: "Подтвердить импорт" })
        .click();
      await expect(page.locator(".feedback")).toContainText(
        "Добавлено задач: 1",
      );
      const before = await downloadBackup(page);
      await expect(before).toContain("Старая задача");
      await context.close();

      await oldServer.close();
      nextServer = startNextServer(port);
      await nextServer.ready;
      context = await engine.launchPersistentContext(profile, {
        timezoneId: "Europe/Moscow",
      });
      page = context.pages()[0];
      await page.clock.setFixedTime(today);
      await page.goto(url);
      await expect(
        page.getByRole("heading", { level: 1, name: /2040/ }),
      ).toBeVisible();
      await page.evaluate(() => {
        (window as { sessionMarker?: string }).sessionMarker = "прежняя-сессия";
      });
      await expect(
        page.getByText(/Обновление готово\. Сохраните изменения/),
      ).toBeVisible({ timeout: 60_000 });
      expect(
        await page.evaluate(
          () => (window as { sessionMarker?: string }).sessionMarker,
        ),
      ).toBe("прежняя-сессия");
      await context.close();

      context = await engine.launchPersistentContext(profile, {
        timezoneId: "Europe/Moscow",
      });
      page = context.pages()[0];
      await page.clock.setFixedTime(today);
      await page.goto(url);
      await expect(
        page.getByText("Готово к работе офлайн", { exact: true }),
      ).toBeVisible();
      await expect(
        page.locator("script[src*='/_next/static/']").first(),
      ).toBeAttached();

      await expect(page.getByLabel("Перейти к дате")).toHaveValue("2040-01-15");
      await page.getByRole("button", { name: "Сегодня", exact: true }).click();
      await expect(
        page.getByText("Старая задача", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Список: Работа" }),
      ).toBeVisible();
      await expect(
        page.getByText("Задача в списке", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Импортированная задача", { exact: true }),
      ).toBeVisible();

      const after = await downloadBackup(page);
      const strip = (value: string) => {
        const backup = JSON.parse(value) as Record<string, unknown>;
        delete backup.exportedAt;
        return backup;
      };
      expect(strip(after)).toEqual(strip(before));

      await page.getByLabel("Tweek CSV").setInputFiles({
        name: "synthetic.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf8"),
      });
      const repeatDialog = page.getByRole("dialog", { name: "Импорт CSV" });
      await expect(repeatDialog).toBeVisible();
      await repeatDialog
        .getByRole("button", { name: "Подтвердить импорт" })
        .click();
      await expect(page.locator(".feedback")).toContainText(
        "Этот файл уже импортирован",
      );

      const shells = await page.evaluate(async () =>
        (await caches.keys()).filter((name) =>
          name.startsWith("yourweek-shell:"),
        ),
      );
      expect(shells).toHaveLength(1);
      const paths = await page.evaluate(
        async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        shells[0],
      );
      expect(paths).toContain("/index.html");
      expect(paths.some((path) => path.startsWith("/_next/static/"))).toBe(
        true,
      );
      expect(paths).not.toContain("/assets/index-CYJ_IzCI.js");
      await context.close();

      await nextServer.close();
      context = await engine.launchPersistentContext(profile, {
        timezoneId: "Europe/Moscow",
        offline: true,
      });
      page = context.pages()[0];
      await page.clock.setFixedTime(today);
      await page.goto(url);
      await expect(
        page.getByText("Готово к работе офлайн", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Старая задача", { exact: true }),
      ).toBeVisible();
      const offlineInput = page
        .getByRole("textbox", { name: /Новая задача/ })
        .first();
      await offlineInput.fill("Сохранено офлайн после перехода");
      await offlineInput.press("Enter");
      await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    } finally {
      await context.close();
      await Promise.allSettled([oldServer?.close(), nextServer?.close()]);
    }
  });
}
