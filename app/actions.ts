"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import * as planner from "../src/planner";
import type { DayTask, TaskEdits } from "../src/planner";

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

async function currentUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session.user.id;
}

export async function listTasks(from: string, to: string): Promise<DayTask[]> {
  return planner.listTasks(await currentUserId(), { from, to });
}

export async function createTask(
  title: string,
  date: string,
): Promise<DayTask> {
  return planner.createTask(await currentUserId(), { title, date });
}

export async function updateTask(
  id: string,
  edits: TaskEdits,
): Promise<DayTask> {
  const task = await planner.updateTask(await currentUserId(), id, edits);
  if (!task) throw new Error("Task not found");
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  if (!(await planner.deleteTask(await currentUserId(), id)))
    throw new Error("Task not found");
}
