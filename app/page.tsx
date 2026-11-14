import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import { signOut } from "./actions";
import { Week } from "./week";
import styles from "./week.module.css";

export default async function WeekPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return (
    <Week
      actions={
        <>
          <button
            className={styles.round}
            aria-label="Menu"
            popoverTarget="menu"
            type="button"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 6h12M4 10h12M4 14h12" />
            </svg>
          </button>
          <div className={styles.menu} id="menu" popover="auto">
            <p className={styles.account}>{session.user.email}</p>
            <form action={signOut}>
              <button className={styles.menuItem}>Sign out</button>
            </form>
          </div>
        </>
      }
    />
  );
}
