import type { Device } from "./registry";

/**
 * Which ad a slot shows. Pure, so the rules that decide what earns money are tested:
 *   1. the ad must be live, and inside its schedule if it has one;
 *   2. it must target the visitor's device or "all"; an ad for the visitor's own device beats an "all" ad, so a phone-sized
 *      banner is never passed over for a generic one;
 *   3. among those, the highest priority wins; ads of equal priority share the slot in proportion to their weight.
 */
export interface PoolAd {
  id: string;
  device: string;
  priority: number;
  weight: number;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export type AdStatus = "live" | "paused" | "scheduled" | "ended";

export function statusOf(ad: Pick<PoolAd, "active" | "startsAt" | "endsAt">, now: Date = new Date()): AdStatus {
  if (!ad.active) return "paused";
  if (ad.startsAt && ad.startsAt > now) return "scheduled";
  if (ad.endsAt && ad.endsAt <= now) return "ended";
  return "live";
}

export function eligible(ad: PoolAd, device: Device, now: Date = new Date()): boolean {
  return statusOf(ad, now) === "live" && (ad.device === device || ad.device === "all");
}

export function chooseAd<T extends PoolAd>(ads: T[], device: Device, now: Date = new Date(), rng: () => number = Math.random): T | null {
  const ok = ads.filter((a) => eligible(a, device, now));
  if (!ok.length) return null;
  const specific = ok.filter((a) => a.device === device);
  const pool = specific.length ? specific : ok;
  const top = Math.max(...pool.map((a) => a.priority));
  const tier = pool.filter((a) => a.priority === top);
  const weights = tier.map((a) => Math.max(1, Math.trunc(a.weight) || 1));
  let r = rng() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < tier.length; i++) {
    r -= weights[i]!;
    if (r < 0) return tier[i]!;
  }
  return tier[tier.length - 1]!;
}

/** Click-through rate as a percentage with two decimals; 0 when nothing was shown. */
export const ctr = (clicks: number, impressions: number): number => (impressions > 0 ? Math.round((clicks / impressions) * 10_000) / 100 : 0);
