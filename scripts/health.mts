// Fails loudly (exit 1) if a dependency the pipeline needs is down. Run before long jobs.
import { prisma } from "../src/lib/db";
import { r2Put, r2Delete } from "../src/lib/r2";
import { UA } from "../src/lib/http";

const checks: [string, () => Promise<string>][] = [
  ["database", async () => String((await prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n`)[0].n)],
  [
    "mangadex api",
    async () => {
      const r = await fetch("https://api.mangadex.org/ping", { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return "ok";
    },
  ],
  [
    "mangadex listing (adult)",
    async () => {
      const r = await fetch("https://api.mangadex.org/manga?limit=1&contentRating[]=pornographic", { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
      const j = (await r.json()) as { total?: number };
      if (!r.ok || !j.total) throw new Error(`HTTP ${r.status}, total=${j.total}`);
      return `${j.total} works`;
    },
  ],
  [
    "r2 write+delete",
    async () => {
      const key = `_health/${Date.now()}.txt`;
      await r2Put(key, new TextEncoder().encode("ok"), "text/plain");
      await r2Delete(key);
      return "ok";
    },
  ],
];

let failed = 0;
for (const [name, fn] of checks) {
  try {
    console.log(`ok    ${name}: ${await fn()}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${(e as Error).message}`);
  }
}
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
