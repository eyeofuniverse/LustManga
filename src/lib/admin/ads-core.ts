import type { Prisma, PrismaClient } from "@prisma/client";
import { parseAdInput, type AdData } from "@/lib/ads/validate";

/**
 * What the Ads screens do to the database, apart from the server actions that call it (a "use server" file may export only
 * actions, and this must never be callable from a browser: it trusts the identity it is given). Every change writes an audit row.
 */
type Db = PrismaClient | Prisma.TransactionClient;
type Me = { id: string; email: string };
export type Result = { ok: true; message: string; id?: string } | { ok: false; message: string };
const ok = (message: string, id?: string): Result => ({ ok: true, message, id });
const fail = (message: string): Result => ({ ok: false, message });

/** More than this in one slot is a mistake (a paste that repeated), not a rotation. */
export const MAX_ADS_PER_SLOT = 30;

const audit = (db: Db, me: Me, action: string, targetId: string, diff?: object) =>
  db.auditLog.create({ data: { actorId: me.id, actorEmail: me.email, action, targetType: "ad", targetId, diff: diff as object | undefined } });

const FIELDS: (keyof AdData)[] = ["name", "type", "device", "code", "imageUrl", "linkUrl", "alt", "width", "height", "isolation", "priority", "weight", "startsAt", "endsAt", "active", "note"];
const same = (a: unknown, b: unknown) => (a instanceof Date || b instanceof Date ? (a as Date | null)?.getTime() === (b as Date | null)?.getTime() : a === b);

/** Create (id = null) or update an ad. The slot of an existing ad cannot be changed: add it to the other slot instead. */
export async function saveAd(db: Db, me: Me, id: string | null, raw: Record<string, unknown>): Promise<Result> {
  const existing = id ? await db.ad.findUnique({ where: { id } }) : null;
  if (id && !existing) return fail("That ad no longer exists. Reload the page.");
  const parsed = parseAdInput({ ...raw, slot: existing ? existing.slot : raw.slot });
  if (!parsed.ok) return fail(parsed.error);
  const d = parsed.data;
  if (!existing) {
    if ((await db.ad.count({ where: { slot: d.slot } })) >= MAX_ADS_PER_SLOT) return fail(`A slot can hold ${MAX_ADS_PER_SLOT} ads at most. Remove some you no longer use.`);
    const row = await db.ad.create({ data: { ...d, createdBy: me.email } });
    await audit(db, me, "ad.create", row.id, { slot: d.slot, name: d.name, type: d.type, device: d.device, active: d.active });
    return ok(`Added “${d.name}”${d.active ? "." : " (paused: switch it on when you are ready)."}`, row.id);
  }
  const changed = FIELDS.filter((k) => !same(existing[k as keyof typeof existing], d[k]));
  if (!changed.length) return ok("Nothing changed.", existing.id);
  await db.ad.update({ where: { id: existing.id }, data: d });
  // the embed code can be long and is the admin's own: the log says that it changed, not what it says
  await audit(db, me, "ad.update", existing.id, { slot: existing.slot, name: d.name, changed: changed.filter((k) => k !== "code"), ...(changed.includes("code") ? { codeChanged: true } : {}) });
  return ok(`Saved “${d.name}”.`, existing.id);
}

export async function setAdActive(db: Db, me: Me, id: string, active: boolean): Promise<Result> {
  const ad = await db.ad.findUnique({ where: { id }, select: { name: true, slot: true, active: true } });
  if (!ad) return fail("That ad no longer exists. Reload the page.");
  if (ad.active === active) return ok(active ? "It was already live." : "It was already paused.");
  await db.ad.update({ where: { id }, data: { active } });
  await audit(db, me, active ? "ad.enable" : "ad.pause", id, { slot: ad.slot, name: ad.name });
  return ok(active ? `“${ad.name}” is live.` : `“${ad.name}” is paused.`);
}

export async function duplicateAd(db: Db, me: Me, id: string): Promise<Result> {
  const ad = await db.ad.findUnique({ where: { id } });
  if (!ad) return fail("That ad no longer exists. Reload the page.");
  if ((await db.ad.count({ where: { slot: ad.slot } })) >= MAX_ADS_PER_SLOT) return fail(`A slot can hold ${MAX_ADS_PER_SLOT} ads at most.`);
  const { id: _id, createdAt: _c, updatedAt: _u, name, ...rest } = ad;
  void _id, _c, _u;
  const copy = await db.ad.create({ data: { ...rest, name: `${name} (copy)`.slice(0, 120), active: false, createdBy: me.email } });
  await audit(db, me, "ad.create", copy.id, { slot: ad.slot, name: copy.name, copiedFrom: id });
  return ok(`Copied as “${copy.name}”. The copy is paused.`, copy.id);
}

export async function deleteAd(db: Db, me: Me, id: string): Promise<Result> {
  const ad = await db.ad.findUnique({ where: { id }, select: { name: true, slot: true } });
  if (!ad) return ok("It was already removed.");
  await db.ad.delete({ where: { id } }); // its daily counts go with it
  await audit(db, me, "ad.delete", id, { slot: ad.slot, name: ad.name });
  return ok(`Removed “${ad.name}”.`);
}

/** The "Show ads" master switch. Off hides every ad and the pop-under at once, without touching any of them. */
export async function setAdsEnabled(db: Db, me: Me, on: boolean): Promise<Result> {
  await db.setting.upsert({ where: { key: "ads.enabled" }, create: { key: "ads.enabled", value: on }, update: { value: on } });
  await audit(db, me, on ? "ads.switch-on" : "ads.switch-off", "all");
  return ok(on ? "Ads are on." : "Ads are off everywhere.");
}
