import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & { uweekPool?: Pool };

// why: dev hot reload re-evaluates modules; reuse one pool instead of leaking connections
const pool = (globalForDb.uweekPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
}));

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
