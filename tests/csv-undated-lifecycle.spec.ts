import { test, expect } from "@playwright/test";

const file = {
  name: "inbox.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(
    "Date,Task,Notes,Checklist,Completed,List\n,Default,,,FALSE,\n,Named,,,FALSE,Проекты",
  ),
};

for (const action of ["renamed", "deleted"] as const) {
  test(`default import restores a ${action} inbox by name without moving old tasks`, async ({
    page,
  }) => {
    await page.goto("/");
    const inbox = page.getByRole("region", {
      name: "Список: Входящие",
      exact: true,
    });
    if (action === "renamed") {
      await inbox
        .getByRole("textbox", { name: "Новая задача: Входящие" })
        .fill("Old task");
      await inbox
        .getByRole("textbox", { name: "Новая задача: Входящие" })
        .press("Enter");
      await inbox
        .getByRole("button", { name: "Переименовать список", exact: true })
        .click();
      await inbox
        .getByRole("textbox", { name: "Название списка" })
        .fill("Архив");
      await inbox.getByRole("button", { name: "Сохранить название" }).click();
    } else {
      await inbox
        .getByRole("button", { name: "Удалить список", exact: true })
        .click();
    }
    await expect(inbox).toHaveCount(0);
    await page.getByLabel("Tweek CSV").setInputFiles(file);
    const dialog = page.getByRole("dialog", { name: "Импорт CSV" });
    await expect(dialog).toContainText("Создаваемые списки: Входящие, Проекты");
    await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
    await expect(inbox.getByRole("listitem").locator(".task-title")).toHaveText(
      "Default",
    );
    if (action === "renamed") {
      await expect(
        page
          .getByRole("region", { name: "Список: Архив", exact: true })
          .getByRole("listitem")
          .locator(".task-title"),
      ).toHaveText("Old task");
    }
    await page.reload();
    await expect(inbox.getByRole("listitem").locator(".task-title")).toHaveText(
      "Default",
    );
  });
}

test("real transaction abort rolls back new lists, tasks and history; open preview retries and repeated bytes cannot recreate lists", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Tweek CSV").setInputFiles(file);
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
  await expect(dialog).toContainText("Импорт не сохранён. База не изменена");
  await expect(
    dialog.getByRole("button", { name: "Подтвердить импорт" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Список: Проекты", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Список: Проекты", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Default", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Tweek CSV").setInputFiles(file);
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
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(dialog).toContainText("Импорт не сохранён");
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 2" }),
  ).toBeVisible();
  const projects = page.getByRole("region", {
    name: "Список: Проекты",
    exact: true,
  });
  await projects
    .getByRole("button", { name: "Переименовать список", exact: true })
    .click();
  await projects
    .getByRole("textbox", { name: "Название списка" })
    .fill("Новый проект");
  await projects.getByRole("button", { name: "Сохранить название" }).click();
  await page.getByLabel("Tweek CSV").setInputFiles(file);
  await dialog.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Добавлено задач: 0" }),
  ).toBeVisible();
  await expect(projects).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Список: Новый проект", exact: true })
      .getByRole("listitem")
      .locator(".task-title"),
  ).toHaveText("Named");
});

for (const [row, reason] of [
  [",Invalid,,item,FALSE,Проекты", "Checklist"],
  ["2026-10-05,Invalid,,,FALSE,  Проекты  ", "Date + List"],
]) {
  test(`mixed file rejects ${reason} without creating lists`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Tweek CSV").setInputFiles({
      ...file,
      buffer: Buffer.from(
        `Date,Task,Notes,Checklist,Completed,List\n,Good,,,FALSE,Проекты\n${row}`,
      ),
    });
    await expect(
      page.getByRole("status").filter({ hasText: reason }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Запись 3" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Список: Проекты", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Good", exact: true }),
    ).toHaveCount(0);
  });
}
