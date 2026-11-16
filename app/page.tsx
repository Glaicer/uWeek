import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import { readWeek, weekQuery } from "../src/planner";
import { setWeekStart, signOut } from "./actions";
import { requestTime } from "./clock";
import { DetectTimeZone, KeepAcrossWeeks, Week } from "./week";
import styles from "./week.module.css";

const weekStarts = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
] as const;

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string | string[];
    focus?: string | string[];
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const query = weekQuery.safeParse(await searchParams);
  if (!query.success) redirect("/");
  const view = await readWeek(session.user.id, query.data, await requestTime());
  if (!view.timeZone) return <DetectTimeZone />;
  return (
    <KeepAcrossWeeks>
      <Week
        key={`${view.dates[0]} ${view.today} ${query.data.focus ?? ""}`}
        today={view.today}
        dates={view.dates}
        weekStartsOn={view.weekStartsOn}
        lists={view.lists}
        tasks={view.tasks}
        focusId={view.focusId}
        menu={
          <>
            <button
              className={`${styles.tool} ${styles.menuButton}`}
              aria-label="Menu"
              popoverTarget="menu"
              type="button"
            >
              ⋯
            </button>
            <div className={styles.menu} id="menu" popover="auto">
              <p className={styles.account}>{session.user.email}</p>
              <form
                action={setWeekStart}
                role="group"
                aria-labelledby="week-starts-on"
              >
                <p className={styles.menuLabel} id="week-starts-on">
                  Week starts on
                </p>
                {weekStarts.map(({ value, label }) => (
                  <button
                    key={value}
                    className={styles.menuItem}
                    name="weekStartsOn"
                    value={value}
                    aria-pressed={view.weekStartsOn === value}
                  >
                    {label}
                  </button>
                ))}
              </form>
              <form action={signOut}>
                <button className={styles.menuItem}>Sign out</button>
              </form>
            </div>
          </>
        }
      />
    </KeepAcrossWeeks>
  );
}
