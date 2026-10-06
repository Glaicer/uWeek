"use client";

import { useEffect } from "react";
import type { PlannerStorage } from "../../src/storage";
import type { prepareCsv } from "../../src/csv";

declare global {
  interface Window {
    __yourweekDevStorage?: {
      PlannerStorage: typeof PlannerStorage;
      prepareCsv: typeof prepareCsv;
    };
  }
}

export function DevStorage() {
  useEffect(() => {
    void (async () => {
      const [{ PlannerStorage }, { prepareCsv }] = await Promise.all([
        import("../../src/storage"),
        import("../../src/csv"),
      ]);
      window.__yourweekDevStorage = { PlannerStorage, prepareCsv };
    })();
  }, []);
  return null;
}
