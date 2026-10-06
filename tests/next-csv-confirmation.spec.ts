import { test, expect } from "@playwright/test";

test("confirmation locks cancellation and double clicks, preserves the open week", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Перейти к дате").fill("2041-03-01");
  await page.getByRole("button", { name: "Перейти", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("2041");
  const week = await page.getByRole("heading", { level: 1 }).textContent();
  await page.getByLabel("Tweek CSV").setInputFiles({
    name: "lock.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Task,Notes,Checklist,Completed,List\n2041-03-01,Once,,,FALSE,",
    ),
  });
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await expect(dialog).toBeVisible();
  const locked = await dialog.evaluate((element) => {
    const buttons = element.querySelectorAll("button");
    buttons[0].click();
    buttons[0].dispatchEvent(new MouseEvent("click"));
    element.dispatchEvent(new Event("cancel", { cancelable: true }));
    return {
      disabled: buttons[0].disabled,
      cancelHidden: buttons[1].hidden,
      stillOpen: (element as HTMLDialogElement).open,
      progress: element.textContent?.includes("Запись импорта"),
    };
  });
  expect(locked).toEqual({
    disabled: true,
    cancelHidden: true,
    stillOpen: true,
    progress: true,
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Once", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(week!);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(week!);
});

test("a real failed request aborts all task and history writes", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const file = {
    name: "constraint.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Task,Notes,Checklist,Completed,List\n2026-10-05,First,,,FALSE,\n2026-10-05,Second,,,FALSE,",
    ),
  };
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    let firstId: string;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "tasks") {
        if (!firstId) firstId = args[0].id;
        else {
          args[0].id = firstId;
          IDBObjectStore.prototype.add = original;
        }
      }
      return original.apply(this, args);
    };
  });
  const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(dialog).toContainText("Импорт не сохранён");
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "First", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Second", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 2" }),
  ).toBeVisible();
});
