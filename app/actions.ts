"use server";

import { APIError, isAPIError } from "better-auth/api";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import * as planner from "../src/planner";
import type { Placement } from "../src/model";
import type { Scope, Task, TaskEdits, TaskList } from "../src/planner";
import { requestTime } from "./clock";

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
      body: { email },
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

export async function signInWithGoogle(): Promise<void> {
  const { url } = await auth.api.signInSocial({
    body: {
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/sign-in?provider=google",
    },
    headers: await headers(),
  });
  if (!url) throw new Error("Google sign-in returned no URL");
  redirect(url);
}

export async function confirmSignIn(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "");
  try {
    await auth.api.magicLinkVerify({
      query: { token },
      headers: await headers(),
    });
  } catch (error) {
    // why: without callbackURL the plugin returns the session on success and throws a 302 APIError whose location carries ?error=<code> on failure
    if (!isAPIError(error) || error.status !== "FOUND") throw error;
    const location = new Headers(error.headers).get("location") ?? "";
    const code = new URL(location, "http://localhost").searchParams.get(
      "error",
    );
    if (code !== "INVALID_TOKEN")
      console.error("Sign-in link verification failed:", code);
    redirect("/sign-in?error=INVALID_TOKEN");
  }
  redirect("/");
}

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}

async function currentUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session.user.id;
}

export async function saveTimeZone(timeZone: string): Promise<void> {
  await planner.updateSettings(await currentUserId(), { timeZone });
  refresh();
}

export async function setWeekStart(form: FormData): Promise<void> {
  await planner.updateSettings(await currentUserId(), {
    weekStartsOn: form.get("weekStartsOn"),
  });
  refresh();
}

export async function createTask(
  title: string,
  placement: Placement,
): Promise<Task> {
  return planner.createTask(await currentUserId(), { title, ...placement });
}

export async function updateTask(
  id: string,
  edits: TaskEdits,
  scope: Scope = "this",
): Promise<Task> {
  return planner.updateTask(await currentUserId(), id, edits, scope);
}

export async function deleteTask(
  id: string,
  scope: Scope = "this",
): Promise<void> {
  await planner.deleteTask(await currentUserId(), id, scope);
}

export async function listTasks(from: string, to: string): Promise<Task[]> {
  return planner.queryTasks(
    await currentUserId(),
    { from, to },
    await requestTime(),
  );
}

export async function searchTasks(
  query: string,
  cursor: number,
): Promise<planner.SearchPage> {
  return planner.searchTasks(await currentUserId(), { query, cursor });
}

export async function createList(title: string): Promise<TaskList> {
  return planner.createList(await currentUserId(), { title });
}

export async function renameList(id: string, title: string): Promise<TaskList> {
  return planner.renameList(await currentUserId(), id, { title });
}

export async function moveList(id: string, to: number): Promise<void> {
  await planner.moveList(await currentUserId(), id, { to });
}

export async function deleteList(id: string): Promise<void> {
  await planner.deleteList(await currentUserId(), id);
}
