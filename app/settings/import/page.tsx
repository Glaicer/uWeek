import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../src/auth";
import { validCalendarDate } from "../../../src/calendar";
import { ImportForm } from "./import-form";
import styles from "./import.module.css";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { week } = await searchParams;
  const back =
    typeof week === "string" && validCalendarDate(week)
      ? `/?week=${week}`
      : "/";
  return (
    <main className={styles.page}>
      <Link className={styles.back} href={back} prefetch={false}>
        ← Back to planner
      </Link>
      <h1>Import from Tweek</h1>
      <p className={styles.muted}>
        Upload your Tweek CSV export to YourWeek. Review it before adding
        anything. Existing tasks stay as they are.
      </p>
      <ImportForm />
      <aside className={styles.limits} aria-label="Import limitations">
        <h2>What CSV cannot restore</h2>
        <p>
          Colors and repeat rules are not included. Repeated titles stay
          separate tasks; no new occurrences are created after the last exported
          date. Missing lists and their tasks cannot be recovered from this
          file.
        </p>
        <p>
          Imported tasks follow saved tasks. Virtual repeat occurrences appear
          after them.
        </p>
        <p>
          Only UTF-8, comma-separated exports with an empty Checklist are
          supported. Maximum 5 MiB and 100,000 records. Fix any errors in the
          original file and choose it again; partial imports are not supported.
        </p>
      </aside>
    </main>
  );
}
