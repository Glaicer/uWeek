import { calendarDate } from "../src/calendar";

type DayRefreshOptions = {
  container: HTMLElement;
  getRenderedDate: () => string;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
};

const rolloverError =
  "Задачи не перенесены. Проверьте доступ к хранилищу и повторите попытку.";

export function startDayRefresh({
  container,
  getRenderedDate,
  refresh,
  onError,
}: DayRefreshOptions): () => void {
  let refreshing = false;
  const refreshDay = async () => {
    if (
      refreshing ||
      document.hidden ||
      getRenderedDate() === calendarDate(new Date()) ||
      document.querySelector("dialog[open]") ||
      (container.contains(document.activeElement) &&
        document.activeElement?.matches("input:focus, textarea:focus"))
    )
      return;
    refreshing = true;
    try {
      await refresh();
    } catch {
      onError(rolloverError);
    } finally {
      refreshing = false;
    }
  };
  const interval = window.setInterval(() => void refreshDay(), 60_000);
  const onFocus = () => void refreshDay();
  const onVisibility = () => void refreshDay();
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
