import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { GET, POST } from "../app/api/auth/[...all]/route";
import { auth } from "./auth";
import { db } from "./db/client";
import { accounts, users } from "./db/schema";
import { createList, listLists } from "./planner";

const origin = "http://127.0.0.1:4200";

function cookiePairs(response: Response): string[] {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
}

function requestUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : String(input);
}

function unsignedIdToken(claims: {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return [
    encode({ alg: "none", typ: "JWT" }),
    encode({
      iss: "https://accounts.google.com",
      aud: "vitest-google-client-id",
      iat: now,
      exp: now + 3600,
      ...claims,
    }),
    "",
  ].join(".");
}

async function startGoogleSignIn(): Promise<{
  authorizeUrl: URL;
  cookie: string;
}> {
  const response = await POST(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/sign-in?provider=google",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const { url } = (await response.json()) as { url: string };
  return {
    authorizeUrl: new URL(url),
    cookie: cookiePairs(response).join("; "),
  };
}

async function finishGoogleSignIn(identity: {
  email: string;
  emailVerified: boolean;
}): Promise<Response> {
  const { authorizeUrl, cookie } = await startGoogleSignIn();
  const state = authorizeUrl.searchParams.get("state");
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = requestUrl(input);
    if (url !== "https://oauth2.googleapis.com/token")
      throw new Error(`Unexpected fetch to ${url}`);
    return Response.json({
      access_token: "access",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: unsignedIdToken({
        sub: `google-${identity.email}`,
        email: identity.email,
        email_verified: identity.emailVerified,
        name: "Google User",
      }),
    });
  });
  return GET(
    new Request(`${origin}/api/auth/callback/google?code=code&state=${state}`, {
      headers: { cookie },
    }),
  );
}

function sessionCookie(response: Response): string | undefined {
  return cookiePairs(response).find((cookie) =>
    cookie.startsWith("better-auth.session_token="),
  );
}

async function userFromEmailLink(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, name: "", email, emailVerified: true });
  await createList(id, { title: "Inbox" });
  return id;
}

async function signedInUser(response: Response) {
  const cookie = sessionCookie(response);
  if (!cookie) throw new Error("Google sign-in set no session cookie");
  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  if (!session) throw new Error("Google sign-in created no session");
  return session.user;
}

afterEach(() => vi.unstubAllGlobals());
afterAll(() => db.$client.end());

test("a new Google user is signed in with one Inbox", async () => {
  const email = `google-${crypto.randomUUID()}@example.com`;

  const response = await finishGoogleSignIn({ email, emailVerified: true });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/");
  const user = await signedInUser(response);
  expect(user).toMatchObject({
    email,
    emailVerified: true,
    name: "Google User",
  });
  expect((await listLists(user.id)).map((list) => list.title)).toEqual([
    "Inbox",
  ]);
});

test("a verified Google email signs in to the account made by email link", async () => {
  const email = `linked-${crypto.randomUUID()}@example.com`;
  const id = await userFromEmailLink(email);

  const response = await finishGoogleSignIn({ email, emailVerified: true });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/");
  expect((await signedInUser(response)).id).toBe(id);
  expect(
    await db.select().from(users).where(eq(users.email, email)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, "google"))),
  ).toHaveLength(1);
  expect((await listLists(id)).map((list) => list.title)).toEqual(["Inbox"]);
});

test("an unverified Google email does not join the existing account", async () => {
  const email = `unverified-${crypto.randomUUID()}@example.com`;
  const id = await userFromEmailLink(email);

  const response = await finishGoogleSignIn({ email, emailVerified: false });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "/sign-in?provider=google&error=account_not_linked",
  );
  expect(sessionCookie(response)).toBeUndefined();
  expect(
    await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, "google"))),
  ).toEqual([]);
});

test("cancelling at Google returns to sign-in", async () => {
  const { authorizeUrl, cookie } = await startGoogleSignIn();
  const state = authorizeUrl.searchParams.get("state");
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`Unexpected fetch to ${requestUrl(input)}`);
  });

  const response = await GET(
    new Request(
      `${origin}/api/auth/callback/google?error=access_denied&state=${state}`,
      { headers: { cookie } },
    ),
  );

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "/sign-in?provider=google&error=access_denied",
  );
  expect(sessionCookie(response)).toBeUndefined();
});
