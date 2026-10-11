import { z } from "zod";

/**
 * What the browser may send to /api/t. Everything is bounded: the endpoint is public, so a hostile caller can send anything,
 * and what survives validation ends up in tables the console prints.
 */
const clientId = z.string().regex(/^[A-Za-z0-9_-]{12,24}$/);
const text = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, "").trim());

export const EVENT_NAMES = ["search", "read_start", "read_end", "favorite", "follow", "download", "share", "age_gate", "not_found"] as const;
export type EventName = (typeof EVENT_NAMES)[number];
export const VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type Vital = (typeof VITALS)[number];

const View = z.object({
  t: z.literal("view"),
  id: clientId,
  path: z.string().max(400),
  /** document.referrer, only on the first page of a visit */
  ref: z.string().max(600).optional(),
  us: text(60).optional(),
  um: text(60).optional(),
  uc: text(60).optional(),
  /** the age gate was still showing */
  gate: z.boolean().optional(),
  /** the screen can be touched (tells an iPad from a Mac) */
  tc: z.boolean().optional(),
});

const Leave = z.object({ t: z.literal("leave"), id: clientId, sec: z.number().int().min(0).max(3600) });

const Ev = z.object({
  t: z.literal("ev"),
  id: clientId,
  n: z.enum(EVENT_NAMES),
  path: z.string().max(400).optional(),
  work: z.number().int().positive().max(2_000_000_000).optional(),
  label: text(120).optional(),
  v: z.number().int().min(0).max(10_000_000).optional(),
  tot: z.number().int().min(0).max(100_000).optional(),
});

const Vit = z.object({
  t: z.literal("vit"),
  path: z.string().max(400),
  tc: z.boolean().optional(),
  items: z
    .array(z.object({ m: z.enum(VITALS), v: z.number().finite().min(0).max(600_000), r: z.enum(["good", "needs-improvement", "poor"]) }))
    .max(8),
});

export const Item = z.discriminatedUnion("t", [View, Leave, Ev, Vit]);
export type Item = z.infer<typeof Item>;

export const MAX_ITEMS = 25;
export const MAX_BODY = 8 * 1024;

/** Accepts `{ "items": [...] }`; invalid entries are dropped, valid ones kept. Returns null when the body is not that shape at all. */
export function parseBody(raw: unknown): Item[] | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { items?: unknown }).items)) return null;
  const out: Item[] = [];
  for (const it of (raw as { items: unknown[] }).items.slice(0, MAX_ITEMS)) {
    const r = Item.safeParse(it);
    if (r.success) out.push(r.data);
  }
  return out;
}

/**
 * Per-event rules on top of the shape: an event with the wrong fields is dropped, not stored half-filled.
 * Returns the cleaned event or null.
 */
export function checkEvent(e: z.infer<typeof Ev>): { name: EventName; workId: number | null; label: string | null; value: number | null; total: number | null } | null {
  const base = { name: e.n, workId: e.work ?? null, label: e.label || null, value: e.v ?? null, total: e.tot ?? null };
  switch (e.n) {
    case "search": {
      const q = (e.label ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
      // a search box is sometimes used to paste things that are not searches: contact details, long numbers
      if (!q || /@|\b\d{9,}\b|https?:\/\//.test(q)) return null;
      return { ...base, label: q, workId: null, total: null };
    }
    case "read_start":
    case "download":
      return e.work ? { ...base, label: null, total: null } : null;
    case "read_end":
      if (!e.work || e.v == null || !e.tot || e.v > e.tot + 1) return null;
      return { ...base, label: null };
    case "favorite":
    case "follow":
      return e.label === "add" || e.label === "remove" ? { ...base, value: null, total: null } : null;
    case "share":
      return e.work ? { ...base, label: null, value: null, total: null } : null;
    case "age_gate":
      return e.label === "pass" ? { ...base, workId: null, value: null, total: null } : null;
    case "not_found":
      return { ...base, label: null, workId: null, value: null, total: null };
  }
}
