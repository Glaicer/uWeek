import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
});

test("пустой ввод и Escape не создают задач; новые задачи добавляются в конец", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "вторник, 6 октября" });
  const input = day.getByRole("textbox");
  await input.fill("   ");
  await input.press("Enter");
  await input.fill("Отменённая задача");
  await input.press("Escape");
  await expect(input).toHaveValue("");
  await input.press("Enter");
  await expect(day.getByRole("listitem")).toHaveCount(0);
  for (const title of ["Первая", "Вторая"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(input).toHaveValue("");
  }
  await page.reload();
  await expect(day.getByRole("listitem").locator(".task-title")).toHaveText([
    "Первая",
    "Вторая",
  ]);
  for (const title of ["Входящие", "Личное", "Идеи"]) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(1);
  }
});

test("отмена настоящей транзакции после успеха запроса не сообщает успех и сохраняет черновик для повтора", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  await expect(input).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.add = original;
      return request;
    };
  });
  await input.fill("Не терять черновик");
  await input.press("Enter");
  await expect(page.getByRole("status")).toContainText("Задача не сохранена");
  await expect(input).toHaveValue("Не терять черновик");
  await expect(day.getByRole("listitem")).toHaveCount(0);
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await page.reload();
  await expect(day.getByRole("listitem").locator(".task-title")).toHaveText(
    "Не терять черновик",
  );
});

test("выполнение сохраняется после транзакции и скрывается фильтром без изменения порядка", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  for (const title of ["Первая", "Вторая"]) {
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  }
  const first = day.getByRole("listitem").first();
  await first.getByRole("checkbox").click();
  await expect(page.getByRole("status")).toHaveText("Выполнение сохранено");
  await expect(first).toHaveAttribute("data-completed", "true");
  const filter = page.getByRole("checkbox", {
    name: "Скрыть выполненные",
  });
  await filter.check();
  await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
  await expect(day.getByRole("listitem")).toHaveCount(1);
  await expect(day.getByRole("listitem").locator(".task-title")).toHaveText(
    "Вторая",
  );
  await page.reload();
  await expect(day.getByRole("listitem")).toHaveCount(1);
  await filter.uncheck();
  await expect(day.getByRole("listitem").locator(".task-title")).toHaveText([
    "Первая",
    "Вторая",
  ]);
  await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
});

test("отмена транзакции при выполнении не подменяет статус и возвращает отметку", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  await input.fill("Не выполнять");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      IDBObjectStore.prototype.put = original;
      return request;
    };
  });
  const row = day.getByRole("listitem");
  await row.getByRole("checkbox").click();
  await expect(page.getByRole("status")).toHaveText(
    "Выполнение не сохранено. Повторите действие.",
  );
  await expect(row).toHaveAttribute("data-completed", "false");
  await expect(row.getByRole("checkbox")).not.toBeChecked();
  await expect(day.locator(".task-title")).toHaveText("Не выполнять");
});

test("повторные отрисовки не дублируют задачи и не очищают незавершённый ввод", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  await input.fill("Черновик переживает отрисовки");
  const tuesday = page.getByRole("region", { name: "вторник, 6 октября" });
  await tuesday.getByRole("textbox").fill("Соседняя задача");
  await tuesday.getByRole("textbox").press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await expect(input).toHaveValue("Черновик переживает отрисовки");
  const filter = page.getByRole("checkbox", { name: "Скрыть выполненные" });
  await filter.check();
  await expect(page.getByRole("status")).toHaveText("Настройка сохранена");
  await filter.uncheck();
  await expect(input).toHaveValue("Черновик переживает отрисовки");
  await expect(day.getByRole("listitem")).toHaveCount(0);
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await expect(day.getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await expect(day.getByRole("listitem").locator(".task-title")).toHaveText([
    "Черновик переживает отрисовки",
  ]);
});

test("кнопка названия открывает прежний редактор, сохранение обновляет доску", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  await input.fill("Переименовать меня");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await day.locator(".task-title").click();
  const dialog = page.locator("dialog.task-editor");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Название").fill("Переименовано через редактор");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Изменения сохранены");
  await expect(day.locator(".task-title")).toHaveText(
    "Переименовано через редактор",
  );
  await page.reload();
  await expect(day.locator(".task-title")).toHaveText(
    "Переименовано через редактор",
  );
});

test("поиск находит задачу и «Перейти к задаче» показывает и фокусирует её", async ({
  page,
}) => {
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  await input.fill("Уникальный ориентир поиска");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await page.getByRole("button", { name: "Предыдущая неделя" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "28 сентября 2026 – 4 октября 2026",
  );
  await page.getByRole("button", { name: "Поиск" }).click();
  const dialog = page.locator("dialog.task-search");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox").fill("Уникальный ориентир");
  await expect(dialog.getByRole("status")).toHaveText("Найдено: 1");
  await dialog.getByRole("button", { name: "Перейти к задаче" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "5 октября 2026 – 11 октября 2026",
  );
  await expect(day.locator(".task-title")).toBeFocused();
});

test("раздел данных и три списка сохраняют место в композиции", async ({
  page,
}) => {
  await expect(page.getByRole("region", { name: "Данные" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Скачать резервную копию" }),
  ).toBeVisible();
  await expect(page.getByLabel("Tweek CSV")).toBeAttached();
  await expect(page.getByRole("button", { name: "Поиск" })).toBeVisible();
  await expect(page.locator(".someday .lists section")).toHaveCount(3);
});
