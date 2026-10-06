export async function startOfflineShell(): Promise<void> {
  if (!import.meta.env?.PROD) return;
  const status = document.createElement("p");
  status.setAttribute("aria-live", "polite");
  status.dataset.offlineStatus = "";
  document.body.append(status);
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    status.textContent = "Офлайн-оболочка недоступна в этом браузере";
    return;
  }
  status.textContent = "Подготовка к работе офлайн…";
  try {
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env?.BASE_URL ?? "/"}sw.js`,
      { updateViaCache: "none" },
    );
    const watchUpdate = () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "redundant" && !registration.active) {
          status.textContent =
            "Офлайн-оболочка не загружена. Повторите запуск с сетью";
        }
        if (worker.state === "installed" && registration.active) showUpdate();
      });
    };
    const showUpdate = () => {
      if (document.querySelector("[data-offline-update]")) return;
      const notice = document.createElement("p");
      notice.dataset.offlineUpdate = "";
      notice.textContent =
        "Обновление готово. Сохраните изменения и закройте все вкладки планера, чтобы применить его при следующем открытии";
      document.body.append(notice);
    };
    registration.addEventListener("updatefound", watchUpdate);
    watchUpdate();
    if (registration.waiting) showUpdate();
    await navigator.serviceWorker.ready;
    status.textContent = "Готово к работе офлайн";
  } catch {
    status.textContent =
      "Офлайн-оболочка не загружена. Повторите запуск с сетью";
  }
}
