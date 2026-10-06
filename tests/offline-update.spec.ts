import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium, expect, test } from "@playwright/test";

const run = promisify(execFile);

async function generate(directory: string) {
  await run(process.execPath, [
    "--input-type=module",
    "-e",
    "import { generateShell } from './scripts/build.mjs'; await generateShell(process.argv[1]);",
    directory,
  ]);
}

async function fixture(directory: string) {
  await mkdir(directory, { recursive: true });
  await cp("dist", directory, { recursive: true });
}

async function serve(directory: string, hold?: Promise<void>) {
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url!, "http://localhost").pathname;
      if (pathname === "/assets/later.txt" && hold) await hold;
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
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

test("готовность не обещается до завершения всех ресурсов или после ошибки установки", async ({
  page,
}, testInfo) => {
  const directory = testInfo.outputPath("shell");
  await fixture(directory);
  await writeFile(join(directory, "assets/later.txt"), "Поздний ресурс");
  await generate(directory);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = await serve(directory, held);
  try {
    await page.goto(server.url);
    await expect(
      page.getByText("Подготовка к работе офлайн…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Готово к работе офлайн", { exact: true }),
    ).not.toBeVisible();
    await rm(join(directory, "assets/later.txt"));
    release();
    await expect(
      page.getByText("Офлайн-оболочка не загружена. Повторите запуск с сетью", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Готово к работе офлайн", { exact: true }),
    ).not.toBeVisible();
  } finally {
    release();
    await server.close();
  }
});

test("ещё не открытая локальная возможность и ресурс доступны без сети", async ({
  page,
  context,
}, testInfo) => {
  const directory = testInfo.outputPath("shell");
  await fixture(directory);
  const html = await readFile(join(directory, "index.html"), "utf8");
  await writeFile(
    join(directory, "index.html"),
    html.replace(
      "</body>",
      `<button id="later">Открыть позже</button><script type="module">document.querySelector('#later').onclick = async () => { const feature = await import('./assets/later.js'); document.querySelector('#later').textContent = await feature.open(); };</script></body>`,
    ),
  );
  await writeFile(
    join(directory, "assets/later.js"),
    `export async function open() { return await (await fetch('./assets/later.txt')).text(); }`,
  );
  await writeFile(
    join(directory, "assets/later.txt"),
    "Локальная возможность открыта",
  );
  await generate(directory);
  const server = await serve(directory);
  try {
    await page.goto(server.url);
    await expect(
      page.getByText("Готово к работе офлайн", { exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await page
      .getByRole("button", { name: "Открыть позже", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Локальная возможность открыта",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});

test("ошибочное и успешное обновления сохраняют задачи, успешное не перезагружает черновик", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium");
  const directory = testInfo.outputPath("shell");
  await fixture(directory);
  const original = await readFile(join(directory, "index.html"), "utf8");
  const server = await serve(directory);
  const profile = testInfo.outputPath("update-profile");
  let context = await chromium.launchPersistentContext(profile, {
    timezoneId: "Europe/Moscow",
  });
  try {
    let page = context.pages()[0];
    await page.goto(server.url);
    await expect(
      page.getByText("Готово к работе офлайн", { exact: true }),
    ).toBeVisible();
    const input = page.getByRole("textbox", { name: /Новая задача/ }).first();
    await input.fill("Сохранено до обновления");
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await writeFile(
      join(directory, "index.html"),
      original.replace(
        "</head>",
        '<meta name="shell-version" content="broken"></head>',
      ),
    );
    await writeFile(join(directory, "assets/missing.txt"), "missing");
    await generate(directory);
    await rm(join(directory, "assets/missing.txt"));
    await page.evaluate(async () => {
      const registration = (await navigator.serviceWorker.getRegistration())!;
      await new Promise<void>((resolve) => {
        registration.addEventListener(
          "updatefound",
          () => {
            const worker = registration.installing!;
            worker.addEventListener("statechange", () => {
              if (worker.state === "redundant") resolve();
            });
          },
          { once: true },
        );
        void registration.update();
      });
    });
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByText("Сохранено до обновления", { exact: true }),
    ).toBeVisible();
    await expect(page.locator('meta[name="shell-version"]')).toHaveCount(0);
    await context.setOffline(false);
    await writeFile(
      join(directory, "index.html"),
      original.replace(
        "</head>",
        '<meta name="shell-version" content="v2"></head>',
      ),
    );
    await generate(directory);
    await input.fill("Несохранённый черновик");
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(
      page.getByText(/Обновление готово\. Сохраните изменения/),
    ).toBeVisible();
    await expect(input).toHaveValue("Несохранённый черновик");
    await expect(page.locator('meta[name="shell-version"]')).toHaveCount(0);
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      timezoneId: "Europe/Moscow",
      offline: true,
    });
    page = context.pages()[0];
    await page.goto(server.url);
    await expect(page.locator('meta[name="shell-version"]')).toHaveAttribute(
      "content",
      "v2",
    );
    await expect(
      page.getByText("Сохранено до обновления", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Несохранённый черновик", { exact: true }),
    ).toBeVisible();
    const shells = await page.evaluate(async () =>
      (await caches.keys()).filter((name) =>
        name.startsWith("yourweek-shell:"),
      ),
    );
    expect(shells).toHaveLength(1);
  } finally {
    await context.close();
    await server.close();
  }
});
