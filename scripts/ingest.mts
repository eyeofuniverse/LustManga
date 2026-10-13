// npm run ingest -- --source=mangadex|hitomi|hentai2read|hentaifox|hentaiera|asmhentai|nhentaixxx [--mode=...] [--limit=N] [--max-minutes=N] [--langs=en,ja] [--dry-run]
//   mangadex: --mode=popular|update  --max-chapters=N
//   hitomi:   --mode=popular|recent|retry  --max-pages=N (0 = no limit)
import { runMangadex } from "../src/lib/ingest/mangadex";
import { runHitomi } from "../src/lib/ingest/hitomi";
import { runHentai2Read } from "../src/lib/ingest/hentai2read";
import { runImEngine } from "../src/lib/ingest/imengine";
import { SITES } from "../src/lib/sources/imengine";
import { prisma } from "../src/lib/db";

const arg = (name: string, dflt: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const source = arg("source", "mangadex");
const common = {
  limit: Number(arg("limit", "5")),
  maxMinutes: Number(arg("max-minutes", "20")),
  langs: arg("langs", "").split(",").filter(Boolean),
  dryRun: flag("dry-run"),
  log: (m: string) => console.log(m),
};

// A silent stall (something that never answers and keeps nothing alive) ended jobs with Node's "unsettled top-level await" (exit
// code 13) only after the whole time budget had gone. Every source prints a line as it works, so a long silence means a stall:
// say so as a warning (not a red failure: what was stored stays stored, and the next scheduled run carries on) and stop.
let lastOutput = Date.now();
for (const m of ["log", "warn", "error"] as const) {
  const original = console[m].bind(console);
  console[m] = (...a: unknown[]) => {
    lastOutput = Date.now();
    original(...a);
  };
}
const STALL_MS = Math.max(5, Number(process.env.INGEST_STALL_MINUTES) || 25) * 60_000;
setInterval(() => {
  if (Date.now() - lastOutput < STALL_MS) return;
  console.log(`::warning title=Ingest stalled::${source} printed nothing for ${Math.round(STALL_MS / 60_000)} minutes, so the job stopped. What was stored is kept; the next run continues.`);
  process.exit(0);
}, 30_000);

let stats;
if (source === "hitomi") {
  stats = await runHitomi({
    ...common,
    mode: arg("mode", "popular") as "popular" | "recent" | "retry",
    maxPages: Number(arg("max-pages", "0")),
  });
} else if (source === "hentai2read") {
  stats = await runHentai2Read({
    ...common,
    mode: arg("mode", "popular") as "popular" | "recent" | "retry",
    maxPages: Number(arg("max-pages", "0")),
    maxChapters: Number(arg("max-chapters", "20")),
  });
} else if (source in SITES) {
  stats = await runImEngine(source, {
    ...common,
    mode: arg("mode", "popular") as "popular" | "recent" | "retry",
    maxPages: Number(arg("max-pages", "0")),
  });
} else if (source === "mangadex") {
  stats = await runMangadex({
    ...common,
    mode: arg("mode", "popular") as "popular" | "backlog" | "update",
    maxChapters: Number(arg("max-chapters", "10")),
  });
} else {
  throw new Error(`unknown --source=${source} (mangadex | hitomi | hentai2read | hentaifox | hentaiera | asmhentai | nhentaixxx)`);
}

console.log("\nsummary", JSON.stringify(stats, null, 2));
await prisma.$disconnect();
// individual failures are recorded on the run; only a run that errored AND stored nothing is a failed job
process.exit(stats.errors.length && !stats.pagesStored ? 1 : 0);
