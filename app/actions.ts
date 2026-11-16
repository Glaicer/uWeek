"use server";

import { APIError } from "better-auth/api";
import { refresh, revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../src/auth";
import { CsvError } from "../src/csv";
import * as planner from "../src/planner";
import type { Placement } from "../src/model";
import type { Scope, Task, TaskEdits, TaskList } from "../src/planner";

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
  const task = await planner.updateTask(
    await currentUserId(),
    id,
    edits,
    scope,
  );
  if (!task) throw new Error("Task not found");
  return task;
}

export async function deleteTask(
  id: string,
  scope: Scope = "this",
): Promise<void> {
  if (!(await planner.deleteTask(await currentUserId(), id, scope)))
    throw new Error("Task not found");
}

export async function listTasks(from: string, to: string): Promise<Task[]> {
  return planner.listTasks(await currentUserId(), { from, to });
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
  const list = await planner.renameList(await currentUserId(), id, { title });
  if (!list) throw new Error("List not found");
  return list;
}

export async function moveList(id: string, to: number): Promise<void> {
  if (!(await planner.moveList(await currentUserId(), id, { to })))
    throw new Error("List not found");
}

export async function deleteList(id: string): Promise<void> {
  if (!(await planner.deleteList(await currentUserId(), id)))
    throw new Error("List not deleted");
}

export async function previewCsv(form: FormData) {
  const userId = await currentUserId();
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Choose a CSV file." };
  try {
    return { preview: await planner.previewCsv(userId, file) };
  } catch (error) {
    return {
      error:
        error instanceof CsvError
          ? error.message
          : "Could not read the file. Try again.",
    };
  }
}

export async function importCsv(form: FormData) {
  const userId = await currentUserId();
  const file = form.get("file");
  const fingerprint = form.get("fingerprint");
  if (!(file instanceof File) || typeof fingerprint !== "string")
    return { error: "Choose a CSV file and review its preview first." };
  try {
    const result = await planner.importCsv(userId, file, fingerprint);
    revalidatePath("/");
    return { result };
  } catch (error) {
    return {
      error:
        error instanceof CsvError
          ? error.message
          : "Could not import the file. Nothing was added. Try again.",
    };
  }
}
