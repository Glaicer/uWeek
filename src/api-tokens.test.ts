import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import {
  authenticateApiToken,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "./api-tokens";
import { db } from "./db/client";
import { apiTokens, users } from "./db/schema";

async function newUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insert(users)
    .values({ id, name: "", email: `${id}@example.com`, emailVerified: true });
  return id;
}

afterAll(() => db.$client.end());

test("a named token is returned once and only its hash is stored", async () => {
  const user = await newUser();
  const created = await createApiToken(user, { name: "  Agent  " });

  expect(created.token).toMatch(/^yw_[A-Za-z0-9_-]{43}$/);
  expect(Buffer.from(created.token.slice(3), "base64url")).toHaveLength(32);
  expect(created.info).toMatchObject({
    name: "Agent",
    prefix: created.token.slice(0, 11),
    lastUsedAt: null,
  });
  expect(created.info.createdAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );

  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, user));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    userId: user,
    name: "Agent",
    prefix: created.token.slice(0, 11),
  });
  expect(rows[0].tokenHash).toBe(
    createHash("sha256").update(created.token).digest("hex"),
  );
  expect(rows[0].createdAt.toISOString()).toBe(created.info.createdAt);

  const listed = await listApiTokens(user);
  expect(listed).toEqual([created.info]);
  expect(listed[0]).not.toHaveProperty("token");
  expect(listed[0]).not.toHaveProperty("tokenHash");
  expect(listed[0]).not.toHaveProperty("userId");
});

test("token names are required and bounded", async () => {
  const user = await newUser();

  for (const name of ["", "   ", "x".repeat(101)])
    await expect(createApiToken(user, { name })).rejects.toThrow();
  expect(
    await db.select().from(apiTokens).where(eq(apiTokens.userId, user)),
  ).toEqual([]);

  const { info } = await createApiToken(user, { name: "x".repeat(100) });
  expect(info.name).toHaveLength(100);
});

test("a valid token resolves its owner and records usage", async () => {
  const user = await newUser();
  const { token, info } = await createApiToken(user, { name: "Agent" });
  expect(info.lastUsedAt).toBeNull();

  expect(await authenticateApiToken(token)).toEqual({
    userId: user,
    tokenId: info.id,
  });
  const [used] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, info.id));
  expect(used.lastUsedAt).not.toBeNull();
  expect((await listApiTokens(user))[0].lastUsedAt).toBe(
    used.lastUsedAt!.toISOString(),
  );

  for (const wrong of [
    token.slice(0, -1),
    `x${token.slice(1)}`,
    "yw_short",
    `Bearer ${token}`,
  ])
    expect(await authenticateApiToken(wrong)).toBeNull();
  expect(await authenticateApiToken("")).toBeNull();

  const [after] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, info.id));
  expect(after.lastUsedAt).toEqual(used.lastUsedAt);
});

test("token inventory and idempotent revocation are isolated by owner", async () => {
  const alice = await newUser();
  const bob = await newUser();
  const agent = await createApiToken(alice, { name: "Agent" });
  const other = await createApiToken(alice, { name: "Other" });
  const bobs = await createApiToken(bob, { name: "Bob's agent" });

  expect((await listApiTokens(bob)).map((token) => token.id)).toEqual([
    bobs.info.id,
  ]);

  expect(await revokeApiToken(bob, agent.info.id)).toBe(false);
  expect(await revokeApiToken(alice, bobs.info.id)).toBe(false);
  expect((await listApiTokens(alice)).map((token) => token.id).sort()).toEqual(
    [agent.info.id, other.info.id].sort(),
  );
  expect((await listApiTokens(bob)).map((token) => token.id)).toEqual([
    bobs.info.id,
  ]);

  expect(await revokeApiToken(alice, agent.info.id)).toBe(true);
  const [revoked] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, agent.info.id));
  expect(revoked.revokedAt).not.toBeNull();

  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(await revokeApiToken(alice, agent.info.id)).toBe(true);
  const [again] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, agent.info.id));
  expect(again.revokedAt).toEqual(revoked.revokedAt);

  expect((await listApiTokens(alice)).map((token) => token.id)).toEqual([
    other.info.id,
  ]);
  expect(await authenticateApiToken(agent.token)).toBeNull();
  expect(await authenticateApiToken(other.token)).toEqual({
    userId: alice,
    tokenId: other.info.id,
  });
});
