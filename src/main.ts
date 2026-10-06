import "./styles.css";
import { startPlanner } from "./boot";
import { startOfflineShell } from "./offline";

const app = document.querySelector<HTMLElement>("#app")!;

void startPlanner(app);
void startOfflineShell(import.meta.env.PROD);
