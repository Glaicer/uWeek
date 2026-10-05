import "./styles.css";
import { startNavigation } from "./navigation";
import { PlannerStorage } from "./storage";

const app = document.querySelector<HTMLElement>("#app")!;

async function start(): Promise<void> {
  try {
    const storage = await PlannerStorage.open();
    await startNavigation(app, storage);
  } catch {
    app.innerHTML =
      '<h1>YourWeek</h1><p role="alert">Локальная база недоступна. Задачи не загружены. Разрешите хранение данных в этом браузере и повторите попытку.</p><button type="button">Повторить</button>';
    app.querySelector("button")!.addEventListener("click", () => void start());
  }
}

void start();
