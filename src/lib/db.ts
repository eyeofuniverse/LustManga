import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Every client connection counts against the database pooler's cap (200 on this plan). Prisma's default pool is
 * (CPU count x 2 + 1) per client, so each serverless instance and each ingest job held 5 to 9, and a busy hour (the site's
 * functions plus the ingest and maintenance jobs, which overlap) reached the cap: "FATAL: (EMAXCONN) max client connections
 * reached" took an ingest job down. A website instance runs short queries through the transaction pooler, so a small pool is
 * plenty; a job gets a few more. A `connection_limit` already in the URL, or DB_POOL, wins.
 */
export function withPoolLimit(url: string | undefined, env: Record<string, string | undefined> = process.env): string | undefined {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  const n = Math.min(20, Math.max(1, Number(env.DB_POOL) || (env.VERCEL ? 3 : 8)));
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${n}`;
}

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  g.prisma ??
  new PrismaClient({ datasourceUrl: withPoolLimit(process.env.DATABASE_URL), log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** Transient pooler/connection errors worth retrying (idempotent work only). */
export function isTransientDbError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    ["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"].includes(err.code)
  )
    return true;
  const msg = err instanceof Error ? err.message : "";
  // EMAXCONN / "max client connections reached": the pooler is full for a moment; backing off and retrying is the right answer
  return /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|EMAXCONN|max client connections|too many (clients|connections)|connection.*(closed|reset|terminat)|Can't reach database|pool timeout/i.test(msg);
}

const ATTEMPTS = Math.max(1, Number(process.env.DB_RETRY_ATTEMPTS) || 5);

export async function db<T>(fn: () => Promise<T>, attempts = ATTEMPTS): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !isTransientDbError(e)) throw e;
      await new Promise((r) => setTimeout(r, Math.min(8000, 300 * 2 ** i) + Math.random() * 250));
    }
  }
}
