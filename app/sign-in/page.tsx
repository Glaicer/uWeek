import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, googleSignInEnabled } from "../../src/auth";
import { signInWithGoogle } from "../actions";
import { SignInForm } from "./sign-in-form";
import styles from "./sign-in.module.css";

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/");
  const { error, provider } = await searchParams;
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>uWeek</h1>
      <p className={styles.lead}>Sign in with a link sent to your email.</p>
      {error && (
        <p className={styles.error} role="alert">
          {provider === "google"
            ? "Google sign-in didn't finish. Try again or sign in with an email link."
            : "This link has expired or was already used. Request a new one."}
        </p>
      )}
      <SignInForm />
      {googleSignInEnabled && (
        <>
          <p className={styles.or}>or</p>
          <form action={signInWithGoogle} className={styles.form}>
            <button className={styles.google}>Continue with Google</button>
          </form>
        </>
      )}
    </main>
  );
}
