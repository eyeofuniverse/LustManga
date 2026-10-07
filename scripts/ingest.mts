// npm run ingest -- --source=mangadex|hitomi|hentai2read [--mode=...] [--limit=N] [--max-minutes=N] [--langs=en,ja] [--dry-run]
//   mangadex: --mode=popular|update  --max-chapters=N
//   hitomi:   --mode=popular|recent|retry  --max-pages=N (0 = no limit)
import { runMangadex } from "../src/lib/ingest/mangadex";
import { runHitomi } from "../src/lib/ingest/hitomi";
import { runHentai2Read } from "../src/lib/ingest/hentai2read";
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
} else if (source === "mangadex") {
  stats = await runMangadex({
    ...common,
    mode: arg("mode", "popular") as "popular" | "backlog" | "update",
    maxChapters: Number(arg("max-chapters", "10")),
  });
} else {
  throw new Error(`unknown --source=${source} (mangadex | hitomi | hentai2read)`);
}

console.log("\nsummary", JSON.stringify(stats, null, 2));
await prisma.$disconnect();
// individual failures are recorded on the run; only a run that errored AND stored nothing is a failed job
process.exit(stats.errors.length && !stats.pagesStored ? 1 : 0);
