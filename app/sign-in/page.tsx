import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../src/auth";
import { SignInForm } from "./sign-in-form";
import styles from "./sign-in.module.css";

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/");
  const { error } = await searchParams;
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>YourWeek</h1>
      <p className={styles.lead}>Sign in with a link sent to your email.</p>
      {error && (
        <p className={styles.error} role="alert">
          This link has expired or was already used. Request a new one.
        </p>
      )}
      <SignInForm />
    </main>
  );
}
