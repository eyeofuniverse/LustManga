// Puts the LustPages ExoClick zones into the Ads section of the console. Safe to run again: an ad that already exists for a zone
// (found by the zone number in its code) is left alone, whether it is live or paused. Changes are audited as "system: ExoClick setup".
//   npm run seed:exoclick                 add what is missing
//   npm run seed:exoclick -- --dry-run    only say what would be added
//
// The zones live on the "LustPages" site in ExoClick (id 1098284). They follow LustHentai's layout: one dedicated zone per place
// per device, so each place's earnings show up on their own line in ExoClick's reports.
//   desktop (Banner): 728x90, 300x250, and 900x250 for page footers
//   phones (Mobile Banner): 300x100 and 300x250, with the sub-category Cartoons/Hentai
//   one pop-under: at most 3 pops per hour, triggered by clicks on links, after a 120 second delay
import { readFileSync } from "node:fs";
import { prisma, db } from "../src/lib/db";
import { saveAd } from "../src/lib/admin/ads-core";
import { defaultSize, slotDef } from "../src/lib/ads/registry";

const dry = process.argv.includes("--dry-run");
const ME = { id: "system-exoclick-setup", email: "system: ExoClick setup" };

/** place -> [desktop zone, mobile zone] */
const ZONES: Record<string, [number, number]> = {
  "home-top": [6053394, 6053392],
  "home-mid": [6053396, 6053398],
  "home-footer": [6053390, 6053400],
  "list-top": [6053402, 6053404],
  "list-in-grid": [6053406, 6053408],
  "list-footer": [6053410, 6053412],
  "search-top": [6053414, 6053416],
  "work-mid": [6053418, 6053420],
  "work-footer": [6053422, 6053424],
  "reader-end": [6053426, 6053428],
  "reader-mid": [6054836, 6054838], // between pages in the reader; shown for looking at only (not clickable)
};
const POPUNDER = 6053388;

// ExoClick's embed: its loader, a tag that carries the zone id, and the call that fills it. The tag's class differs by zone type.
const banner = (zone: number, cls: "eas6a97888e2" | "eas6a97888e10") =>
  `<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="${cls}" data-zoneid="${zone}"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`;

const work: { slot: string; device: "desktop" | "mobile" | "all"; zone: number; code: string; w: number | null; h: number | null; label: string }[] = [];
for (const [slot, [desktop, mobile]] of Object.entries(ZONES)) {
  const def = slotDef(slot);
  if (!def) throw new Error(`unknown slot ${slot}`);
  for (const [device, zone, cls] of [["desktop", desktop, "eas6a97888e2"], ["mobile", mobile, "eas6a97888e10"]] as const) {
    const size = defaultSize(def, device);
    if (!size) throw new Error(`${slot} has no ${device} size`);
    work.push({ slot, device, zone, code: banner(zone, cls), w: size.w, h: size.h, label: `${def.label} (${device})` });
  }
}
const popTemplate = readFileSync(new URL("./exoclick-popunder.txt", import.meta.url), "utf8").trim();
if (!popTemplate.includes("{{ZONE}}")) throw new Error("the pop-under template has no {{ZONE}} placeholder");
work.push({ slot: "global-popunder", device: "all", zone: POPUNDER, code: popTemplate.replace("{{ZONE}}", String(POPUNDER)), w: null, h: null, label: "Site-wide pop-under" });

let added = 0;
let skipped = 0;
for (const w of work) {
  const note = `ExoClick zone ${w.zone}`;
  // found by the zone number inside the ad code, so editing an ad's note in the console cannot make this add a second copy
  const have = await db(() => prisma.ad.findFirst({ where: { slot: w.slot, type: "code", code: { contains: String(w.zone) } }, select: { id: true } }), 8); // retried: the connection can blip
  if (have) {
    skipped++;
    continue;
  }
  if (dry) {
    console.log(`would add  ${w.slot.padEnd(16)} ${w.device.padEnd(8)} zone ${w.zone}`);
    added++;
    continue;
  }
  const r = await saveAd(
    prisma,
    ME,
    null,
    { slot: w.slot, name: `ExoClick: ${w.label}`, type: "code", device: w.device, code: w.code, width: w.w ?? "", height: w.h ?? "", isolation: "inline", priority: 0, weight: 1, active: "on", note: `${note} (site LustPages, 1098284)` },
    true,
  );
  if (!r.ok) throw new Error(`${w.slot} ${w.device}: ${r.message}`);
  console.log(`added      ${w.slot.padEnd(16)} ${w.device.padEnd(8)} zone ${w.zone}`);
  added++;
}
console.log(`${dry ? "would add" : "added"} ${added}, already there ${skipped}`);
await prisma.$disconnect();
