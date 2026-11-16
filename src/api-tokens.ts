import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client";
import { apiTokens } from "./db/schema";

export const tokenCreate = z.object({
  name: z.string().trim().min(1).max(100),
});

export interface ApiTokenInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiPrincipal {
  userId: string;
  tokenId: string;
}

const tokenColumns = {
  id: apiTokens.id,
  name: apiTokens.name,
  prefix: apiTokens.prefix,
  createdAt: apiTokens.createdAt,
  lastUsedAt: apiTokens.lastUsedAt,
};

type TokenRow = Pick<
  typeof apiTokens.$inferSelect,
  "id" | "name" | "prefix" | "createdAt" | "lastUsedAt"
>;

const infoOf = (row: TokenRow): ApiTokenInfo => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
});

const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function createApiToken(
  userId: string,
  input: z.input<typeof tokenCreate>,
): Promise<{ token: string; info: ApiTokenInfo }> {
  const { name } = tokenCreate.parse(input);
  const token = `yw_${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(apiTokens)
    .values({
      id: randomUUID(),
      userId,
      name,
      tokenHash: tokenHash(token),
      prefix: token.slice(0, 11),
    })
    .returning(tokenColumns);
  return { token, info: infoOf(row) };
}

export async function listApiTokens(userId: string): Promise<ApiTokenInfo[]> {
  const rows = await db
    .select(tokenColumns)
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt), asc(apiTokens.id));
  return rows.map(infoOf);
}

const tokenPattern = /^yw_[A-Za-z0-9_-]{43}$/;

export async function revokeApiToken(
  userId: string,
  id: string,
): Promise<boolean> {
  z.uuid().parse(id);
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: sql`coalesce(${apiTokens.revokedAt}, now())` })
    .where(and(eq(apiTokens.userId, userId), eq(apiTokens.id, id)))
    .returning({ id: apiTokens.id });
  return row !== undefined;
}

export async function authenticateApiToken(
  token: string,
): Promise<ApiPrincipal | null> {
  if (!tokenPattern.test(token)) return null;
  const [row] = await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiTokens.tokenHash, tokenHash(token)),
        isNull(apiTokens.revokedAt),
      ),
    )
    .returning({ userId: apiTokens.userId, tokenId: apiTokens.id });
  return row ?? null;
}
