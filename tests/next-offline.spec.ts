import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { chromium, expect, test } from "@playwright/test";

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

test("после остановки сервера планер офлайн работает, записывает и ищет", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const server = await startNextServer(4205);
  await server.ready;
  const profile = testInfo.outputPath("offline-profile");
  let context = await chromium.launchPersistentContext(profile, {
    timezoneId: "Europe/Moscow",
  });
  try {
    let page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(`${server.url}/`);
    await expect(
      page.getByText("Готово к работе офлайн", { exact: true }),
    ).toBeVisible();
    const input = page.getByRole("textbox", { name: /Новая задача/ }).first();
    await input.fill("До остановки сервера");
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await context.close();

    await server.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "Europe/Moscow",
      offline: true,
    });
    page = context.pages()[0];
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
    await page.goto(`${server.url}/`);
    await expect(
      page.getByText("До остановки сервера", { exact: true }),
    ).toBeVisible();
    const offlineInput = page
      .getByRole("textbox", { name: /Новая задача/ })
      .first();
    await offlineInput.fill("Сохранено без сети и сервера");
    await offlineInput.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");

    await page.getByRole("button", { name: "Поиск", exact: true }).click();
    const search = page.locator(".task-search");
    await expect(search).toBeVisible();
    await search.getByRole("searchbox").fill("Сохранено без сети и сервера");
    await expect(search.getByRole("status")).toHaveText("Найдено: 1");
  } finally {
    await context.close();
  }
});
