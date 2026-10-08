// Fails loudly (exit 1) if a dependency the job NEEDS is down. Run before long jobs.
//   npm run health                      database + R2 are required; third-party sites are only reported
//   npm run health -- --need=mangadex   also require the MangaDex API (the MangaDex ingest job)
// A job for one source must not die because an unrelated site had a blip, so those checks only warn,
// and every check retries before it counts as a failure.
import { prisma } from "../src/lib/db";
import { r2Put, r2Delete } from "../src/lib/r2";
import { UA } from "../src/lib/http";

const need = new Set((process.argv.find((a) => a.startsWith("--need=")) ?? "").slice(7).split(",").filter(Boolean));

interface Check {
  name: string;
  /** a failure fails the run when true; otherwise it is only a warning */
  required: boolean;
  run: () => Promise<string>;
}

const get = (url: string) => fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });

const checks: Check[] = [
  { name: "database", required: true, run: async () => String((await prisma.$queryRaw<{ n: number }[]>`SELECT 1 AS n`)[0].n) },
  {
    name: "r2 write+delete",
    required: true,
    run: async () => {
      const key = `_health/${Date.now()}.txt`;
      await r2Put(key, new TextEncoder().encode("ok"), "text/plain");
      await r2Delete(key);
      return "ok";
    },
  },
  {
    name: "mangadex api",
    required: need.has("mangadex"),
    run: async () => {
      const r = await get("https://api.mangadex.org/ping");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return "ok";
    },
  },
  {
    name: "mangadex listing (adult)",
    required: need.has("mangadex"),
    run: async () => {
      const r = await get("https://api.mangadex.org/manga?limit=1&contentRating[]=pornographic");
      const j = (await r.json()) as { total?: number };
      if (!r.ok || !j.total) throw new Error(`HTTP ${r.status}, total=${j.total}`);
      return `${j.total} works`;
    },
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** try up to 3 times, a few seconds apart: one dropped connection is not an outage */
async function attempt(c: Check): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  let error = "";
  for (let i = 1; i <= 3; i++) {
    try {
      return { ok: true, detail: await c.run() };
    } catch (e) {
      error = (e as Error).message;
      if (i < 3) await sleep(i * 4000);
    }
  }
  return { ok: false, error };
}

let failed = 0;
for (const c of checks) {
  const r = await attempt(c);
  if (r.ok) console.log(`ok    ${c.name}: ${r.detail}`);
  else if (c.required) {
    failed++;
    console.log(`FAIL  ${c.name}: ${r.error}`);
  } else console.log(`warn  ${c.name}: ${r.error} (not needed by this job)`);
}
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
