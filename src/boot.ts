import { PlannerStorage } from "./storage";
import { startNavigation } from "./navigation";

export function showBootError(app: HTMLElement, retry: () => void): void {
  app.innerHTML =
    '<h1>YourWeek</h1><p role="alert">Локальная база недоступна. Задачи не загружены. Разрешите хранение данных в этом браузере и повторите попытку.</p><button type="button">Повторить</button>';
  app.querySelector("button")!.addEventListener("click", () => void retry());
}

export async function startPlanner(app: HTMLElement): Promise<void> {
  try {
    const storage = await PlannerStorage.open();
    await startNavigation(app, storage);
  } catch {
    showBootError(app, () => void startPlanner(app));
  }
}
