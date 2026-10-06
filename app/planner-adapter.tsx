"use client";

import { useEffect, useRef } from "react";
import { showBootError } from "../src/boot";
import { startOfflineShell } from "../src/offline";
import { PlannerStorage } from "../src/storage";
import { startNavigation } from "../src/navigation";

const bootStatus = "Загрузка планера…";

export function PlannerAdapter() {
  const appRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void startOfflineShell(process.env.NODE_ENV === "production");
  }, []);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    let stale = false;

    const showLoading = () => {
      const status = document.createElement("p");
      status.setAttribute("role", "status");
      status.textContent = bootStatus;
      app.replaceChildren(status);
    };

    const boot = async () => {
      showLoading();
      try {
        const storage = await PlannerStorage.open();
        if (stale) return;
        await startNavigation(app, storage);
      } catch {
        if (stale) return;
        showBootError(app, boot);
      }
    };

    void boot();
    return () => {
      stale = true;
    };
  }, []);

  return (
    <main id="app" ref={appRef}>
      <p role="status">{bootStatus}</p>
    </main>
  );
}
