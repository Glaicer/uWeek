import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & { uweekPool?: Pool };

function createPool(): Pool {
  // why: every serverless instance holds its own pool, so each keeps few connections and drops idle ones fast
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 5000,
  });
  attachDatabasePool(pool);
  return pool;
}

// why: dev hot reload re-evaluates modules; reuse one pool instead of leaking connections
const pool = (globalForDb.uweekPool ??= createPool());

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
