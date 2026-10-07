import { runMangadex } from "../src/lib/ingest/mangadex";
import { prisma } from "../src/lib/db";

const arg = (name: string, dflt: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const stats = await runMangadex({
  mode: arg("mode", "popular") as "popular" | "update",
  limit: Number(arg("limit", "5")),
  maxMinutes: Number(arg("max-minutes", "20")),
  maxChapters: Number(arg("max-chapters", "10")),
  dryRun: flag("dry-run"),
  log: (m) => console.log(m),
});
console.log("\nsummary", JSON.stringify(stats, null, 2));
await prisma.$disconnect();
process.exit(stats.errors.length ? 1 : 0);
