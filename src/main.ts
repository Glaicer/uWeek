import "./styles.css";
import { renderBoard } from "./board";
import { calendarDate, currentWeek } from "./calendar";
import { PlannerStorage } from "./storage";

const app = document.querySelector<HTMLElement>("#app")!;

async function start(): Promise<void> {
  try {
    const storage = await PlannerStorage.open();
    const today = new Date();
    const days = currentWeek(today);
    const [tasks, lists] = await Promise.all([
      storage.readWeek(calendarDate(days[0]), calendarDate(days[6])),
      storage.readLists(),
    ]);
    renderBoard(app, days, calendarDate(today), tasks, lists, (title, date) =>
      storage.createTask(title, date),
    );
  } catch {
    app.innerHTML =
      '<h1>YourWeek</h1><p role="alert">Локальная база недоступна. Задачи не загружены. Разрешите хранение данных в этом браузере и повторите попытку.</p><button type="button">Повторить</button>';
    app.querySelector("button")!.addEventListener("click", () => void start());
  }
}

void start();
