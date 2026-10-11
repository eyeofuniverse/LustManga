import "server-only";
import { unstable_cache } from "next/cache";
import { cookies, headers } from "next/headers";
import { prisma, db } from "@/lib/db";
import { isBot, deviceOf } from "@/lib/analytics/ua";
import { IS_PRODUCTION } from "@/lib/site";
import { bandOfDevice, defaultSize, onDevice, slotDef, type Device } from "./registry";
import { chooseAd, type PoolAd } from "./select";

/**
 * Deciding, on the server, which ad (if any) a visitor gets in a slot. The choice is made while the page is built, so there
 * is no extra request and no box that appears after the page has settled; and a slot with no ad to show renders nothing.
 *
 * Nobody is served an ad who should not be: robots (invalid traffic for the ad network), a signed-in admin (an accidental click
 * on your own ad can get an account closed) and test runs. The ads themselves are held back in the browser until the visitor
 * has confirmed they are an adult (see AdBox).
 */
export const ADS_TAG = "ads";
/** How long the ad lists are kept (an admin's save drops them at once). Short in tests, via ADS_CACHE_SECONDS. */
const TTL = Math.max(1, Number(process.env.ADS_CACHE_SECONDS) || 60);
const SESSION_COOKIES = ["__Host-lm_session", "lm_session"];

export interface ServedAd {
  id: string;
  slot: string;
  type: "code" | "banner";
  code: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  isolation: "inline" | "frame";
  device: Device;
}

interface Row extends PoolAd {
  type: string;
  code: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  isolation: string;
}

/** Everything live-or-not for a slot, kept for a minute (and dropped the moment an admin saves a change). Dates are revived because the cache stores JSON. */
const poolFor = unstable_cache(
  async (slot: string): Promise<Row[]> => {
    const rows = await db(() => prisma.ad.findMany({ where: { slot, active: true }, orderBy: { createdAt: "asc" } }));
    return rows.map((r) => ({ ...r, startsAt: r.startsAt, endsAt: r.endsAt }));
  },
  ["ads-pool-v1"],
  { revalidate: TTL, tags: [ADS_TAG] },
);

const switchOn = unstable_cache(
  async (): Promise<boolean> => {
    const s = await db(() => prisma.setting.findUnique({ where: { key: "ads.enabled" } }));
    return s ? s.value !== false : true;
  },
  ["ads-switch-v1"],
  { revalidate: TTL, tags: [ADS_TAG] },
);

/**
 * Master switch: ADS=off in the environment, or "Show ads" turned off in the console. Only the production deployment shows ads:
 * a preview deployment has its own address but reads the same database, so it would otherwise serve real ad code from an
 * address the ad network has never heard of, and add its visits to the real counts.
 */
export async function adsEnabled(): Promise<boolean> {
  if (process.env.ADS === "off" || !IS_PRODUCTION) return false;
  return switchOn().catch(() => true);
}

/** May this request be shown ads at all? */
export async function adsAllowed(): Promise<{ allowed: boolean; device: Device }> {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const device = bandOfDevice(deviceOf(ua));
  if (isBot(ua)) return { allowed: false, device };
  const jar = await cookies();
  if (jar.get("lm_nocount")?.value === "1" || SESSION_COOKIES.some((c) => jar.has(c))) return { allowed: false, device };
  return { allowed: true, device };
}

const revive = (r: Row): Row => ({ ...r, startsAt: r.startsAt ? new Date(r.startsAt) : null, endsAt: r.endsAt ? new Date(r.endsAt) : null });

export async function serveAd(slot: string): Promise<ServedAd | null> {
  const def = slotDef(slot);
  if (!def || !(await adsEnabled())) return null;
  const { allowed, device } = await adsAllowed();
  if (!allowed || !onDevice(def, device)) return null;
  let pool: Row[];
  try {
    pool = (await poolFor(slot)).map(revive);
  } catch {
    return null; // an ad must never be the reason a page fails
  }
  const ad = chooseAd(pool, device);
  if (!ad) return null;
  const size = defaultSize(def, device);
  return {
    id: ad.id,
    slot,
    type: ad.type === "banner" ? "banner" : "code",
    code: ad.code,
    imageUrl: ad.imageUrl,
    linkUrl: ad.linkUrl,
    alt: ad.alt,
    width: ad.width ?? size?.w ?? null,
    height: ad.height ?? size?.h ?? null,
    isolation: ad.isolation === "frame" ? "frame" : "inline",
    device,
  };
}

/** Is any ad live anywhere? (The privacy page says so only when it is true.) */
export const adsInUse = unstable_cache(
  async (): Promise<boolean> => {
    if (process.env.ADS === "off" || !IS_PRODUCTION) return false;
    const on = await db(() => prisma.setting.findUnique({ where: { key: "ads.enabled" } }));
    if (on && on.value === false) return false;
    return (await db(() => prisma.ad.count({ where: { active: true, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } }))) > 0;
  },
  ["ads-in-use-v1"],
  { revalidate: 300, tags: [ADS_TAG] },
);

/* ───────────── counting ───────────── */

export const isAdId = (s: unknown): s is string => typeof s === "string" && /^c[a-z0-9]{20,30}$/.test(s);

async function bump(id: string, column: "impressions" | "clicks"): Promise<void> {
  // one row per ad per UTC day; the SELECT keeps a made-up id from creating anything
  if (column === "impressions")
    await prisma.$executeRaw`INSERT INTO "AdStat" ("adId", day, impressions, clicks) SELECT id, (now() AT TIME ZONE 'utc')::date, 1, 0 FROM "Ad" WHERE id = ${id}
      ON CONFLICT ("adId", day) DO UPDATE SET impressions = "AdStat".impressions + 1`;
  else
    await prisma.$executeRaw`INSERT INTO "AdStat" ("adId", day, impressions, clicks) SELECT id, (now() AT TIME ZONE 'utc')::date, 0, 1 FROM "Ad" WHERE id = ${id}
      ON CONFLICT ("adId", day) DO UPDATE SET clicks = "AdStat".clicks + 1`;
}

export const countImpression = (id: string) => db(() => bump(id, "impressions"), 3);
export const countClick = (id: string) => db(() => bump(id, "clicks"), 3);
