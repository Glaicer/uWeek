import { execFile } from "node:child_process";
import { watch } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);
const globalForMigrations = globalThis as typeof globalThis & {
  uweekMigrationWatcher?: boolean;
};

const migrate = () => run(process.execPath, ["src/db/migrate.ts"]);

// why: a long-running pnpm dev must apply migrations generated while it runs, or queries hit missing columns
export async function migrateNowAndOnChange(): Promise<void> {
  await migrate();
  if (globalForMigrations.uweekMigrationWatcher) return;
  globalForMigrations.uweekMigrationWatcher = true;

  let queue = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;
  watch("drizzle/meta", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      queue = queue.then(() =>
        migrate().then(
          () => console.info("Database migrations applied"),
          (error) => console.error("Database migrations failed", error),
        ),
      );
    }, 300);
  });
}
