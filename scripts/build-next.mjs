import { spawn } from "node:child_process";
import { copyFile, cp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { URL, fileURLToPath } from "node:url";
import { generateShell } from "./build.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = join(root, "public");
const shellDir = join(root, ".next", "offline-shell");
const generated = ["sw.js", "index.html", "LICENSE", "THIRD_PARTY_NOTICES.md"];

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      ...options,
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with code ${code}`));
    });
  });
}

for (const file of generated) {
  await rm(join(publicDir, file), { force: true });
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
await run(process.execPath, [nextBin, "build"], {
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

const prerendered = join(root, ".next", "server", "app", "index.html");
try {
  await readFile(prerendered);
} catch {
  throw new Error(
    "Маршрут / не статически пререндерен: .next/server/app/index.html не найден. Офлайн-оболочке нужен статический HTML входа.",
  );
}

await rm(shellDir, { recursive: true, force: true });
await mkdir(join(shellDir, "_next"), { recursive: true });
await copyFile(prerendered, join(shellDir, "index.html"));
await cp(join(root, ".next", "static"), join(shellDir, "_next", "static"), {
  recursive: true,
});
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  await copyFile(join(root, file), join(shellDir, file));
}
await mkdir(publicDir, { recursive: true });
await cp(publicDir, shellDir, {
  recursive: true,
  filter: (source) => !generated.includes(source.slice(publicDir.length + 1)),
});

const { version, files } = await generateShell(shellDir);

for (const file of generated) {
  await copyFile(join(shellDir, file), join(publicDir, file));
}

process.stdout.write(
  `offline shell: ${files.length} ресурсов, версия ${version} → public/sw.js\n`,
);
