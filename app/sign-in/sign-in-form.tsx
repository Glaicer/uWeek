"use client";

import { useActionState } from "react";
import { requestSignInLink, type SignInState } from "../actions";
import styles from "./sign-in.module.css";

const idle: SignInState = { status: "idle" };

export function SignInForm() {
  const [state, action, pending] = useActionState(requestSignInLink, idle);
  if (state.status === "sent")
    return (
      <p className={styles.sent} role="status">
        Check your email. We sent a sign-in link to {state.email}.
      </p>
    );
  return (
    <form action={action} className={styles.form}>
      <label className={styles.label} htmlFor="email">
        Email
      </label>
      <input
        className={styles.input}
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      {state.status === "error" && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
      <button className={styles.submit} disabled={pending}>
        Send link
      </button>
    </form>
  );
}
