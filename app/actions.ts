"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export async function requestSignInLink(
  _previous: SignInState,
  form: FormData,
): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim();
  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/", errorCallbackURL: "/sign-in" },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError)
      return {
        status: "error",
        message:
          error.status === "BAD_REQUEST"
            ? "Enter a valid email address."
            : "Could not send the link. Try again in a minute.",
      };
    console.error(error);
    return {
      status: "error",
      message: "Could not send the link. Try again later.",
    };
  }
  return { status: "sent", email };
}

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
