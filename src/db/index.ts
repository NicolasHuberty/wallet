import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type GlobalForDb = typeof globalThis & { pgPool?: Pool };
const g = globalThis as GlobalForDb;

function getPool(): Pool {
  if (g.pgPool) return g.pgPool;
  // Fallback placeholder so Next's build-time collection never crashes on import.
  // Any actual query during a real request with no DATABASE_URL set will throw on connect.
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://build-time-placeholder:5432/void";
  g.pgPool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return g.pgPool;
}

// Proxy the pool — lazy so build-time env absence doesn't crash.
const poolProxy = new Proxy({} as Pool, {
  get: (_, prop: keyof Pool) => {
    const p = getPool() as unknown as Record<string | symbol, unknown>;
    const value = p[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(p) : value;
  },
});

export const db = drizzle(poolProxy, { schema });
export { schema };
