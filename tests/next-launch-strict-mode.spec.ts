import { expect, test } from "@playwright/test";

test("повторная инициализация Strict Mode не создаёт дубли списков, задач и обработчиков", async ({
  page,
}) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00+03:00"));
  await page.goto("/");
  const day = page.getByRole("region", { name: "понедельник, 5 октября" });
  const input = day.getByRole("textbox");
  await expect(input).toBeVisible();
  for (const title of ["Входящие", "Личное", "Идеи"]) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(1);
  }
  await input.fill("Строгий режим");
  await input.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Задача сохранена");
  await expect(day.getByRole("listitem")).toHaveCount(1);
  const counts = await page.evaluate(
    () =>
      new Promise<{ tasks: number; lists: number }>((resolve, reject) => {
        const open = indexedDB.open("yourweek");
        open.addEventListener("success", () => {
          const database = open.result;
          const count = (store: string) =>
            new Promise<number>((resolveCount, rejectCount) => {
              const request = database
                .transaction(store, "readonly")
                .objectStore(store)
                .count();
              request.addEventListener("success", () =>
                resolveCount(request.result),
              );
              request.addEventListener("error", () =>
                rejectCount(request.error),
              );
            });
          Promise.all([count("tasks"), count("lists")]).then(
            ([tasks, lists]) => {
              database.close();
              resolve({ tasks, lists });
            },
            reject,
          );
        });
        open.addEventListener("error", () => reject(open.error));
      }),
  );
  expect(counts).toEqual({ tasks: 1, lists: 3 });
  expect(errors).toEqual([]);
});
