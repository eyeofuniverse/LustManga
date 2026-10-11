import type { Prisma } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { clientIp, makeLimiter } from "@/lib/ratelimit";
import { analyticsEnabled, ownHosts } from "./config";
import { checkEvent, MAX_BODY, parseBody, type Item } from "./payload";
import { normalisePath } from "./paths";
import { classifyReferrer, cleanTag } from "./referrer";
import { describe, isBot } from "./ua";
import { visitorId } from "./visitor";

// per server instance, like the other public endpoints: stops a loop, not a determined attacker
const tooMany = makeLimiter(90, 60_000);

const SESSION_COOKIES = ["__Host-lm_session", "lm_session"];

/** The Origin header must name this site. (A test server may run on any localhost port.) */
function fromOurSite(origin: string): boolean {
  try {
    const u = new URL(origin);
    return ownHosts().includes(u.host.toLowerCase()) || (process.env.ANALYTICS_FORCE === "1" && u.hostname === "localhost");
  } catch {
    return false;
  }
}

/** The visitor asked not to be measured, or is one of us. Checked on every request; the browser also checks, but never trusted. */
export function optedOut(headers: Headers): boolean {
  if (headers.get("dnt") === "1" || headers.get("sec-gpc") === "1") return true;
  const cookie = headers.get("cookie") ?? "";
  if (/(^|;\s*)lm_nocount=1/.test(cookie)) return true; // test runs
  return SESSION_COOKIES.some((c) => cookie.includes(`${c}=`)); // an admin is signed in: our own clicks are not traffic
}

export interface Outcome {
  status: 204 | 400 | 403 | 413 | 429;
  /** the database work, run after the response has been sent so the page never waits for it */
  write?: () => Promise<void>;
}

const country = (h: Headers): string | null => {
  const c = (h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || "").toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
};

const language = (h: Headers): string | null => {
  const first = (h.get("accept-language") ?? "").split(",")[0]?.trim().toLowerCase().split(/[-;_]/)[0] ?? "";
  return /^[a-z]{2,3}$/.test(first) ? first : null;
};

const debug = (...a: unknown[]) => process.env.ANALYTICS_DEBUG === "1" && console.error("analytics:", ...a);

export async function collect(req: Request): Promise<Outcome> {
  if (!analyticsEnabled()) return { status: 204 };

  const origin = req.headers.get("origin");
  if (origin && !fromOurSite(origin)) return { status: 403 };
  if (optedOut(req.headers)) {
    debug("skipped: opted out");
    return { status: 204 };
  }

  const ua = req.headers.get("user-agent") ?? "";
  if (isBot(ua)) {
    debug("skipped: robot", ua.slice(0, 60));
    return { status: 204 };
  }

  const ip = clientIp(req);
  if (tooMany(ip)) return { status: 429 };

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return { status: 413 };
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return { status: 413 };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: 400 };
  }
  const items = parseBody(json);
  if (!items) return { status: 400 };
  if (!items.length) {
    debug("skipped: nothing valid in the batch");
    return { status: 204 };
  }

  const visitor = visitorId(ip, ua);
  if (!visitor) return { status: 204 }; // no secret configured: record nothing rather than something reversible

  debug("accepted", items.map((i) => i.t).join(","), "ip", ip);
  const at = new Date();
  const ctx = { visitor, at, country: country(req.headers), lang: language(req.headers), ua };
  return { status: 204, write: () => store(items, ctx) };
}

interface Ctx {
  visitor: string;
  at: Date;
  country: string | null;
  lang: string | null;
  ua: string;
}

/** Turns validated items into rows. Exported for the tests; never throws (a failed write must not matter to the visitor). */
export async function store(items: Item[], c: Ctx): Promise<void> {
  const own = ownHosts();
  const views: Prisma.PageViewCreateManyInput[] = [];
  const events: { id: string; at: Date; visitor: string; name: string; path: string | null; workId: number | null; label: string | null; value: number | null; total: number | null }[] = [];
  const vitals: { at: Date; metric: string; value: number; rating: string; kind: string; device: string }[] = [];
  const leaves: { id: string; sec: number }[] = [];

  for (const it of items) {
    if (it.t === "view") {
      const np = normalisePath(it.path);
      if (!np) continue;
      const ref = classifyReferrer(it.ref, own);
      const ua = describe(c.ua, it.tc === true);
      views.push({
        id: it.id,
        at: c.at,
        visitor: c.visitor,
        path: np.path,
        kind: np.kind,
        workId: np.workId,
        referrer: ref.host,
        refKind: ref.kind,
        utmSource: cleanTag(it.us),
        utmMedium: cleanTag(it.um),
        utmCampaign: cleanTag(it.uc),
        country: c.country,
        device: ua.device,
        browser: ua.browser,
        os: ua.os,
        lang: c.lang,
        gated: it.gate === true,
      });
    } else if (it.t === "leave") {
      leaves.push({ id: it.id, sec: it.sec });
    } else if (it.t === "ev") {
      const ev = checkEvent(it);
      if (!ev) continue;
      const np = it.path ? normalisePath(it.path) : null;
      events.push({ id: it.id, at: c.at, visitor: c.visitor, ...ev, path: np?.path ?? null });
    } else if (it.t === "vit") {
      const np = normalisePath(it.path);
      if (!np) continue;
      const device = describe(c.ua, it.tc === true).device;
      for (const v of it.items) vitals.push({ at: c.at, metric: v.m, value: Math.round(v.m === "CLS" ? v.v * 1000 : v.v), rating: v.r, kind: np.kind, device });
    }
  }

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await db(fn, 3);
    } catch (e) {
      console.error(`analytics: ${label} not stored: ${(e as Error).message.slice(0, 160)}`);
    }
  };
  if (views.length) await run("views", () => prisma.pageView.createMany({ data: views, skipDuplicates: true }));
  // a leave report only counts when it comes from the same visitor that made the view, and soon enough to be the same visit
  for (const l of leaves)
    await run("leave", () =>
      prisma.$executeRaw`UPDATE "PageView" SET seconds = LEAST(3600, GREATEST(COALESCE(seconds, 0), ${l.sec}::int)) WHERE id = ${l.id} AND visitor = ${c.visitor} AND at > now() - interval '12 hours'`,
    );
  // "how far did they read" is reported again as they read on, so it keeps the furthest page (and only for the same visitor)
  const ends = events.filter((e) => e.name === "read_end");
  for (const e of ends)
    await run("read_end", () =>
      prisma.$executeRaw`INSERT INTO "AnalyticsEvent" (id, at, visitor, name, path, "workId", value, total) VALUES (${e.id}, ${e.at}, ${e.visitor}, 'read_end', ${e.path}, ${e.workId}, ${e.value}::int, ${e.total}::int) ON CONFLICT (id) DO UPDATE SET value = GREATEST(COALESCE("AnalyticsEvent".value, 0), EXCLUDED.value) WHERE "AnalyticsEvent".visitor = EXCLUDED.visitor`,
    );
  const rest = events.filter((e) => e.name !== "read_end");
  if (rest.length) await run("events", () => prisma.analyticsEvent.createMany({ data: rest, skipDuplicates: true }));
  if (vitals.length) await run("vitals", () => prisma.webVital.createMany({ data: vitals }));
}
