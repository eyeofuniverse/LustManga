// Refresh what the SOURCE sites say about our works (followers, views, favourites, ratings, popular charts) so
// Popular, Trending and Top rated reflect the wider readership instead of waiting for visitors to this site.
//   npm run signals                                everything
//   npm run signals -- --sources=mangadex,hitomi   the fast, cheap sources (a handful of requests: run it often)
//   npm run signals -- --sources=stats             each work's own page on Hentai2Read, HentaiFox, HentaiEra, AsmHentai, nhentai.xxx
//        --stats-minutes=25 --stats-limit=3000     time budget, and works per site per run (stalest first)
//   npm run signals -- --dry-run                   compute and report, write nothing
import { refreshSignals } from "../src/lib/ingest/signals";
import { prisma } from "../src/lib/db";

const arg = (name: string, dflt: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? dflt;
const known = ["mangadex", "hitomi", "stats"] as const;
const sources = arg("sources", known.join(","))
  .split(",")
  .filter((s): s is (typeof known)[number] => (known as readonly string[]).includes(s));
if (!sources.length) throw new Error(`--sources must name some of: ${known.join(", ")}`);

const results = await refreshSignals({
  sources,
  statsMinutes: Math.max(1, Number(arg("stats-minutes", "25"))),
  statsLimit: Math.max(1, Number(arg("stats-limit", "3000"))),
  dryRun: process.argv.includes("--dry-run"),
  log: (m) => console.log(m),
});
await prisma.$disconnect();
const failed = results.filter((r) => r.error).length;
console.log(`\nsignals: ${results.length - failed} source(s) refreshed${failed ? `, ${failed} failed` : ""}`);
// a failed source is reported but does not fail the run: the next one tries again, and the old numbers stay in place
process.exit(0);
