import "server-only";
import { notFound } from "next/navigation";
import { prisma, db } from "@/lib/db";
import { guardConsole } from "@/lib/admin/guard";
import { hasRole } from "@/lib/admin/auth";
import { bandsFor, slotDef, SLOTS } from "@/lib/ads/registry";
import { statusOf, type AdStatus } from "@/lib/ads/select";
import type { AdRow, AdsOverview, SlotPage, SlotSummary } from "@/lib/ads/types";
import { parseRange, type Range } from "@/lib/analytics/ranges";

/**
 * Advertising is revenue and what visitors see, so it needs an admin or the owner: a moderator does not get the screens, and
 * every loader checks that on its own (see guardConsole for why it cannot be left to the layout).
 */
async function guardAds() {
  const me = await guardConsole();
  if (!hasRole(me, "ADMIN")) notFound();
  return me;
}

const DAYS: Record<Range, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
/** the first UTC day of the range, as YYYY-MM-DD */
function since(range: Range, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (DAYS[range] - 1)));
  return d.toISOString().slice(0, 10);
}

const emptyCounts = (): Record<AdStatus, number> => ({ live: 0, paused: 0, scheduled: 0, ended: 0 });

async function switchState() {
  const s = await db(() => prisma.setting.findUnique({ where: { key: "ads.enabled" } }));
  return { enabled: s ? s.value !== false : true, envOff: process.env.ADS === "off" };
}

export async function loadAdsOverview(rangeRaw: unknown): Promise<AdsOverview> {
  await guardAds();
  const range = parseRange(rangeRaw);
  const from = since(range);
  const now = new Date();
  const [ads, perSlot, perDay, sw] = await Promise.all([
    db(() => prisma.ad.findMany({ select: { slot: true, active: true, startsAt: true, endsAt: true, device: true } })),
    db(() =>
      prisma.$queryRaw<{ slot: string; imp: number; clk: number }[]>`
      SELECT a.slot, coalesce(sum(s.impressions), 0)::int AS imp, coalesce(sum(s.clicks), 0)::int AS clk
      FROM "AdStat" s JOIN "Ad" a ON a.id = s."adId" WHERE s.day >= ${from}::date GROUP BY a.slot`,
    ),
    db(() =>
      prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT to_char(day, 'YYYY-MM-DD') AS d, sum(impressions)::int AS n FROM "AdStat" WHERE day >= ${from}::date GROUP BY 1`,
    ),
    switchState(),
  ]);
  const stat = new Map(perSlot.map((r) => [r.slot, r]));
  const slots: SlotSummary[] = SLOTS.map((def) => {
    const counts = emptyCounts();
    for (const a of ads) if (a.slot === def.key) counts[statusOf({ active: a.active, startsAt: a.startsAt, endsAt: a.endsAt }, now)]++;
    return { key: def.key, label: def.label, group: def.group, where: def.where, kind: def.kind, revenue: def.revenue, bands: bandsFor(def), ads: counts, impressions: stat.get(def.key)?.imp ?? 0, clicks: stat.get(def.key)?.clk ?? 0 };
  });
  // every day in the range, including the ones with nothing
  const byDay = new Map(perDay.map((r) => [r.d, r.n]));
  const series: { day: string; n: number }[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < DAYS[range]; i++) {
    const day = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    series.push({ day, n: byDay.get(day) ?? 0 });
  }
  return {
    range,
    ...sw,
    totals: {
      impressions: slots.reduce((n, s) => n + s.impressions, 0),
      clicks: slots.reduce((n, s) => n + s.clicks, 0),
      liveAds: slots.reduce((n, s) => n + s.ads.live, 0),
      slotsLive: slots.filter((s) => s.ads.live > 0).length,
    },
    series,
    slots,
    asOf: now.toISOString(),
  };
}

export async function loadSlot(key: string, rangeRaw: unknown): Promise<SlotPage> {
  const me = await guardAds();
  const def = slotDef(key);
  if (!def) notFound();
  const range = parseRange(rangeRaw);
  const from = since(range);
  const now = new Date();
  const [rows, rangeStats, allStats, sw] = await Promise.all([
    db(() => prisma.ad.findMany({ where: { slot: key }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] })),
    db(() =>
      prisma.$queryRaw<{ id: string; imp: number; clk: number }[]>`
      SELECT s."adId" AS id, sum(s.impressions)::int AS imp, sum(s.clicks)::int AS clk FROM "AdStat" s JOIN "Ad" a ON a.id = s."adId"
      WHERE a.slot = ${key} AND s.day >= ${from}::date GROUP BY 1`,
    ),
    db(() =>
      prisma.$queryRaw<{ id: string; imp: number; clk: number }[]>`
      SELECT s."adId" AS id, sum(s.impressions)::int AS imp, sum(s.clicks)::int AS clk FROM "AdStat" s JOIN "Ad" a ON a.id = s."adId" WHERE a.slot = ${key} GROUP BY 1`,
    ),
    switchState(),
  ]);
  const r = new Map(rangeStats.map((x) => [x.id, x]));
  const a = new Map(allStats.map((x) => [x.id, x]));
  const ads: AdRow[] = rows.map((x) => ({
    id: x.id,
    slot: x.slot,
    name: x.name,
    type: x.type === "banner" ? "banner" : "code",
    device: (["desktop", "mobile"].includes(x.device) ? x.device : "all") as AdRow["device"],
    code: x.code,
    imageUrl: x.imageUrl,
    linkUrl: x.linkUrl,
    alt: x.alt,
    width: x.width,
    height: x.height,
    isolation: x.isolation === "frame" ? "frame" : "inline",
    priority: x.priority,
    weight: x.weight,
    startsAt: x.startsAt?.toISOString() ?? null,
    endsAt: x.endsAt?.toISOString() ?? null,
    active: x.active,
    note: x.note,
    createdBy: x.createdBy,
    createdAt: x.createdAt.toISOString(),
    updatedAt: x.updatedAt.toISOString(),
    status: statusOf(x, now),
    impressions: r.get(x.id)?.imp ?? 0,
    clicks: r.get(x.id)?.clk ?? 0,
    impressionsAll: a.get(x.id)?.imp ?? 0,
    clicksAll: a.get(x.id)?.clk ?? 0,
  }));
  return {
    range,
    ...sw,
    slot: { key: def.key, label: def.label, group: def.group, where: def.where, kind: def.kind, revenue: def.revenue, bands: bandsFor(def), desktop: def.desktop, mobile: def.mobile, tip: def.tip },
    ads,
    canEditCode: hasRole(me, "OWNER"),
    asOf: now.toISOString(),
  };
}
