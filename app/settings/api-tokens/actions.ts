"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as tokens from "../../../src/api-tokens";
import { auth } from "../../../src/auth";

export type CreateTokenState =
  | { status: "idle" }
  | { status: "created"; token: string }
  | { status: "error"; message: string };

export type RevokeTokenState =
  | { status: "idle" }
  | { status: "revoked" }
  | { status: "error"; message: string };

async function currentUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session.user.id;
}

export async function createApiToken(
  _previous: CreateTokenState,
  form: FormData,
): Promise<CreateTokenState> {
  const userId = await currentUserId();
  const name = String(form.get("name") ?? "");
  try {
    const { token } = await tokens.createApiToken(userId, { name });
    refresh();
    return { status: "created", token };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        status: "error",
        message: name.trim()
          ? "Use a token name of 100 characters or fewer."
          : "Enter a token name.",
      };
    console.error(error);
    return {
      status: "error",
      message: "Could not create the token. Try again later.",
    };
  }
}

export async function revokeApiToken(
  _previous: RevokeTokenState,
  form: FormData,
): Promise<RevokeTokenState> {
  const userId = await currentUserId();
  const id = String(form.get("id") ?? "");
  try {
    const revoked = await tokens.revokeApiToken(userId, id);
    if (!revoked)
      return { status: "error", message: "That token no longer exists." };
    refresh();
    return { status: "revoked" };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { status: "error", message: "That token no longer exists." };
    console.error(error);
    return {
      status: "error",
      message: "Could not revoke the token. Try again later.",
    };
  }
}
