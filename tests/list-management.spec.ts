import { test, expect } from "@playwright/test";

test("списки добавляются в конец, переименовываются без потери задач и защищены от коллизий и удаления", async ({
  page,
}) => {
  await page.goto("/");
  const someday = page.getByRole("region", {
    name: "Когда-нибудь",
    exact: true,
  });
  const newList = someday.getByRole("textbox", {
    name: "Название нового списка",
  });
  await newList.fill("  Работа  ");
  await newList.press("Enter");
  await expect(someday.getByRole("heading", { level: 3 })).toHaveText([
    "Входящие",
    "Личное",
    "Идеи",
    "Работа",
  ]);
  await newList.fill("  рАбОтА  ");
  await newList.press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "Список с таким названием уже существует",
  );
  await expect(newList).toHaveValue("  рАбОтА  ");
  await expect(someday.getByRole("heading", { level: 3 })).toHaveCount(4);
  const work = page.getByRole("region", {
    name: "Список: Работа",
    exact: true,
  });
  await work
    .getByRole("textbox", { name: "Новая задача: Работа" })
    .fill("Не потерять");
  await work
    .getByRole("textbox", { name: "Новая задача: Работа" })
    .press("Enter");
  await work
    .getByRole("button", { name: "Переименовать список", exact: true })
    .click();
  await work.getByRole("textbox", { name: "Название списка" }).fill("  ИДЕИ  ");
  await work.getByRole("button", { name: "Сохранить название" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Список с таким названием уже существует",
  );
  await work
    .getByRole("textbox", { name: "Название списка" })
    .fill("  Проекты  ");
  await work.getByRole("button", { name: "Сохранить название" }).click();
  const projects = page.getByRole("region", {
    name: "Список: Проекты",
    exact: true,
  });
  await expect(projects.getByRole("listitem")).toHaveText("Не потерять");
  await projects
    .getByRole("checkbox", { name: "Выполнена: Не потерять" })
    .check();
  await page.getByRole("checkbox", { name: "Скрыть выполненные" }).check();
  await projects
    .getByRole("button", { name: "Удалить список", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Нельзя удалить список с задачами",
  );
  await expect(projects).toBeVisible();
  for (const name of ["Входящие", "Личное", "Идеи"]) {
    await page
      .getByRole("region", { name: `Список: ${name}`, exact: true })
      .getByRole("button", { name: "Удалить список", exact: true })
      .click();
  }
  await page.getByRole("checkbox", { name: "Скрыть выполненные" }).uncheck();
  await projects
    .getByRole("button", { name: "Не потерять", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Удалить задачу" })
    .click();
  await projects
    .getByRole("button", { name: "Удалить список", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Нельзя удалить последний список",
  );
  await page.reload();
  await expect(someday.getByRole("heading", { level: 3 })).toHaveText([
    "Проекты",
  ]);
});
