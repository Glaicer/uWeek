import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function download(page: Page) {
  const pending = page.waitForEvent("download", { timeout: 3000 });
  await page
    .getByRole("button", { name: "Скачать резервную копию", exact: true })
    .click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}

async function create(page: Page, title: string) {
  const input = page
    .locator(".day")
    .first()
    .getByRole("textbox", { name: /Новая задача/ });
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
}

test("whitespace checklist is rejected visibly with draft retained and existing backup unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await create(page, "Checklist draft");
  const before = await download(page);
  await page
    .getByRole("button", { name: "Checklist draft", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor
    .getByRole("combobox", { name: "Цвет", exact: true })
    .selectOption("red");
  await editor
    .getByRole("button", { name: "Добавить пункт", exact: true })
    .click();
  await editor.getByLabel("Текст пункта 1", { exact: true }).fill("   ");
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "непустой текст пункта",
  );
  await expect(
    editor.getByLabel("Текст пункта 1", { exact: true }),
  ).toHaveValue("   ");
  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "Отмена", exact: true }).click();
  const after = await download(page);
  expect(after.tasks).toEqual(before.tasks);
});

for (const direction of ["Ниже", "Выше"] as const) {
  test(`keyboard reorder ${direction} keeps focus on moved task after disabling and rerender`, async ({
    page,
  }) => {
    await page.goto("/");
    for (const title of ["First", "Second", "Middle", "Fourth", "Last"])
      await create(page, title);
    const button = page.getByRole("button", {
      name: `${direction}: Middle`,
      exact: true,
    });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Порядок сохранён");
    await expect(button).toBeFocused();
    await expect(
      page.locator(".day").first().locator(".task-title"),
    ).toHaveText(
      direction === "Ниже"
        ? ["First", "Second", "Fourth", "Middle", "Last"]
        : ["First", "Middle", "Second", "Fourth", "Last"],
    );
    await page.keyboard.press("Enter");
    await expect(
      page.locator(".day").first().locator(".task-title"),
    ).toHaveText(
      direction === "Ниже"
        ? ["First", "Second", "Fourth", "Last", "Middle"]
        : ["Middle", "First", "Second", "Fourth", "Last"],
    );
    await expect(
      page.getByRole("button", { name: "Middle", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}

test("keyboard reorder failure restores focused control and leaves order unchanged", async ({
  page,
}) => {
  await page.goto("/");
  for (const title of ["First", "Last"]) await create(page, title);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === "tasks")
        request.addEventListener("success", () => request.transaction!.abort());
      return request;
    };
  });
  const button = page.getByRole("button", { name: "Ниже: First", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Порядок не сохранён");
  await expect(button).toBeFocused();
  await expect(page.locator(".day").first().locator(".task-title")).toHaveText([
    "First",
    "Last",
  ]);
});

test("CSV completion counts actual new lists, ignored records, reused lists and repeat zero", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const file = {
    name: "lists.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Task,Notes,Checklist,Completed,List\n,A,,,FALSE,Идеи\n,B,,,FALSE,New\n,C,,,FALSE,Race\n\n",
    ),
  };
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByLabel("Название нового списка").fill("Race");
  await other
    .getByRole("button", { name: "Добавить список", exact: true })
    .click();
  await expect(
    other.getByRole("region", { name: "Список: Race", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(page.locator(".feedback")).toHaveText(
    "Добавлено задач: 3. Новых списков: 1. Пустых записей: 1.",
  );
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  await page.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(page.locator(".feedback")).toHaveText(
    "Добавлено задач: 0. Новых списков: 0. Пустых записей: 1. Этот файл уже импортирован.",
  );
});
