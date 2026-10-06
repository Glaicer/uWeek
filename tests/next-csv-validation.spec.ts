import { test, expect } from "@playwright/test";

const header = "Date,Task,Notes,Checklist,Completed,List";
const good = "2026-10-05,Valid,,,FALSE,";
const invalidFiles = [
  [
    "duplicate header",
    "Date,Task,Notes,Checklist,Completed,Date\n" + good,
    "Запись 1",
  ],
  [
    "unknown header",
    "Date,Task,Notes,Checklist,Completed,Other\n" + good,
    "Запись 1",
  ],
  [
    "missing header",
    "Date,Task,Notes,Checklist,Completed\n" + good,
    "Запись 1",
  ],
  ["invalid day", `${header}\n2026-02-30,Invalid,,,FALSE,`, "Запись 2"],
  ["invalid status", `${header}\n2026-10-05,Invalid,,,1,`, "Completed"],
  ["whitespace date", `${header}\n ,Invalid,,,FALSE,`, "Date"],
  [
    "ambiguous placement",
    `${header}\n2026-10-05,Invalid,,,FALSE,Inbox`,
    "Date + List",
  ],
  [
    "unsupported checklist",
    `${header}\n2026-10-05,Invalid,,item,FALSE,`,
    "Checklist",
  ],
  ["missing task", `${header}\n2026-10-05, ,,,FALSE,`, "пустое название"],
  ["field count", `${header}\n2026-10-05,Invalid,,,FALSE`, "шесть полей"],
  ["bare quote", `${header}\n2026-10-05,Inva"lid,,,FALSE,`, "повреждённый CSV"],
  [
    "unclosed quote",
    `${header}\n2026-10-05,"Invalid,,,FALSE,`,
    "повреждённый CSV",
  ],
  [
    "junk after quote",
    `${header}\n2026-10-05,"Invalid"x,,,FALSE,`,
    "повреждённый CSV",
  ],
  [
    "space after quote",
    `${header}\n2026-10-05,"Invalid" ,,,FALSE,`,
    "повреждённый CSV",
  ],
  [
    "late error",
    `${header}\n${Array(21).fill(good).join("\n")}\n2026-10-05,"Invalid"x,,,FALSE,`,
    "Запись 23",
  ],
  [
    "logical number after multiline and empty",
    `${header}\n2026-10-05,Valid,"one\ntwo",,FALSE,\n\n2026-10-05,Invalid,,,bad,`,
    "Запись 4",
  ],
] as const;

for (const [name, csv, reason] of invalidFiles) {
  test(`rejects ${name} before any write`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Tweek CSV").setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await expect(
      page.getByRole("status").filter({ hasText: reason }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Valid", exact: true }),
    ).toHaveCount(0);
  });
}

for (const [name, bytes] of [
  ["bad continuation", [0xc3, 0x28]],
  ["overlong sequence", [0xc0, 0xaf]],
  ["truncated sequence", [0xe2, 0x82]],
] as const) {
  test(`rejects UTF-8 ${name}`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Tweek CSV").setInputFiles({
      name: "bytes.csv",
      mimeType: "text/csv",
      buffer: Buffer.concat([Buffer.from(header + "\n"), Buffer.from(bytes)]),
    });
    await expect(
      page.getByRole("status").filter({ hasText: "UTF-8" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("size and logical-record limits reject before preview", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Tweek CSV");
  await input.setInputFiles({
    name: "large.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 32),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "5 MiB" }),
  ).toBeVisible();
  await input.setInputFiles({
    name: "records.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(header + "\n" + Array(100_001).fill(good).join("\n")),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "100 000" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("BOM, reordered headers, escaped quotes, literal markup and dates after 2040 survive", async ({
  page,
}) => {
  await page.goto("/");
  const csv =
    '\ufeffList,Notes,Completed,Date,Checklist,Task\r\n,"<xml>✨, ""quoted""\r\nnext</xml>",fAlSe,2041-02-28,,"  Unicode Я ✨  "\r\n,,,,,\r\n';
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(dialog).toContainText("Пустых записей: 1");
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 1" }),
  ).toBeVisible();
  await page.getByLabel("Перейти к дате").fill("2041-02-28");
  await page.getByRole("button", { name: "Перейти", exact: true }).click();
  await page.getByRole("button", { name: "Unicode Я ✨", exact: true }).click();
  await expect(page.getByLabel("Заметка", { exact: true })).toHaveValue(
    '<xml>✨, "quoted"\nnext</xml>',
  );
  await expect(page.locator("xml")).toHaveCount(0);
});

test("aborting a real import transaction rolls back tasks and fingerprint, retry succeeds", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "retry.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `${header}\n2026-10-05,Retry,,,FALSE,\n2026-10-05,Retry2,,,FALSE,`,
    ),
  });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      const request = original.apply(this, args);
      if (this.name === "importHistory") {
        request.addEventListener("success", () => this.transaction.abort());
        IDBObjectStore.prototype.add = original;
      }
      return request;
    };
  });
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(dialog).toContainText("Импорт не сохранён");
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "retry.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `${header}\n2026-10-05,Retry,,,FALSE,\n2026-10-05,Retry2,,,FALSE,`,
    ),
  });
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 2" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(1);
});
