import { createHash } from "node:crypto";
import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";
import { build } from "vite";

export async function generateShell(directory) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      resolve(entry.parentPath, entry.name).slice(
        resolve(directory).length + 1,
      ),
    )
    .filter(
      (file) =>
        file !== "sw.js" &&
        !file.endsWith(".map") &&
        !file.startsWith(".vite/"),
    )
    .sort();
  const template = await readFile(new URL("./sw.js", import.meta.url), "utf8");
  const hash = createHash("sha256").update(template);
  for (const file of files) {
    hash.update(file).update(await readFile(resolve(directory, file)));
  }
  const version = hash.digest("hex");
  await writeFile(
    resolve(directory, "sw.js"),
    template
      .replace("__SHELL_FILES__", JSON.stringify(files))
      .replace("__SHELL_VERSION__", version),
  );
  return { version, files };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let output;
  await build({
    plugins: [
      {
        name: "offline-output",
        configResolved(config) {
          output = resolve(config.root, config.build.outDir);
        },
      },
    ],
  });
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    await copyFile(
      new URL(`../${file}`, import.meta.url),
      resolve(output, file),
    );
  }
  await generateShell(output);
}
