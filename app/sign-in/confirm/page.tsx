import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../src/auth";
import { confirmSignIn } from "../../actions";
import styles from "../sign-in.module.css";

export default async function SignInConfirmPage({
  searchParams,
}: PageProps<"/sign-in/confirm">) {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/");
  const token = (await searchParams).token;
  if (typeof token !== "string" || !token)
    redirect("/sign-in?error=INVALID_TOKEN");
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>uWeek</h1>
      <p className={styles.lead}>Finish signing in to this browser.</p>
      <form action={confirmSignIn} className={styles.form}>
        <input type="hidden" name="token" value={token} />
        <button className={styles.submit}>Sign in</button>
      </form>
    </main>
  );
}
