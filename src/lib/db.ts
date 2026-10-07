import { PrismaClient, Prisma } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  g.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
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
  return /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|connection.*(closed|reset|terminat)|Can't reach database|pool timeout/i.test(msg);
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
