import { bandsFor, slotDef, type Band } from "./registry";

/**
 * What an admin may save as an ad, checked on the server before anything is stored. The ad network's embed code is the
 * admin's to supply and is stored as written; everything that becomes a link or an image address is held to a strict rule,
 * because those end up in front of every visitor.
 */
export const MAX_CODE = 20_000;

/** An http(s) address with a host, no embedded login, no spaces, of a sane length; anything else is null. */
export function safeUrl(raw: unknown, opts: { httpsOnly?: boolean } = {}): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 2000 || /\s/.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && !opts.httpsOnly)) return null;
    if (!u.hostname || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export interface AdData {
  slot: string;
  name: string;
  type: "code" | "banner";
  device: Band;
  code: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  isolation: "inline" | "frame";
  priority: number;
  weight: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  note: string | null;
}

export type Parsed = { ok: true; data: AdData } | { ok: false; error: string };
const bad = (error: string): Parsed => ({ ok: false, error });

const str = (v: unknown) => (typeof v === "string" ? v : "");
const intIn = (v: unknown, min: number, max: number): number | null => {
  const s = str(v).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
};
/**
 * "" = not set (null); a date, or a date and time (a browser's datetime-local value, "2026-10-12T14:30"), read as UTC = set;
 * anything else = invalid (undefined).
 */
export function when(v: unknown): Date | null | undefined {
  const s = str(v).trim();
  if (!s) return null;
  let iso: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = `${s}T00:00:00Z`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) iso = `${s}:00Z`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) iso = s;
  else return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseAdInput(raw: Record<string, unknown>): Parsed {
  const slot = str(raw.slot);
  const def = slotDef(slot);
  if (!def) return bad("That slot does not exist.");

  const name = str(raw.name).trim();
  if (!name) return bad("Give the ad a name, so you can tell it apart in the list.");
  if (name.length > 120) return bad("The name is too long (120 characters at most).");

  const type = str(raw.type) === "banner" ? "banner" : "code";
  const device = str(raw.device) as Band;
  if (!bandsFor(def).includes(device)) return bad(`"${def.label}" has no position on ${device === "mobile" ? "phones" : device === "desktop" ? "computers" : "that device"}.`);

  let code: string | null = null;
  let imageUrl: string | null = null;
  let linkUrl: string | null = null;
  let alt: string | null = null;
  if (type === "code") {
    code = str(raw.code).trim();
    if (!code) return bad("Paste the ad code from your ad network.");
    if (code.length > MAX_CODE) return bad(`The ad code is too long (${MAX_CODE.toLocaleString()} characters at most).`);
  } else {
    if (def.kind === "popunder") return bad("A pop-under is a script: use Ad code.");
    imageUrl = safeUrl(raw.imageUrl, { httpsOnly: true });
    if (!imageUrl) return bad("The image address must be a full https:// address (no spaces).");
    linkUrl = safeUrl(raw.linkUrl);
    if (!linkUrl) return bad("The link address must be a full http:// or https:// address (no spaces).");
    alt = str(raw.alt).trim().slice(0, 300) || null;
  }

  const blank = (v: unknown) => !str(v).trim();
  const width = blank(raw.width) ? null : intIn(raw.width, 1, 2000);
  const height = blank(raw.height) ? null : intIn(raw.height, 1, 2000);
  if ((!blank(raw.width) && width === null) || (!blank(raw.height) && height === null)) return bad("Width and height must be whole numbers between 1 and 2000, or left empty to use the slot's size.");

  const isolation = type === "code" && str(raw.isolation) === "frame" ? "frame" : "inline";
  if (def.kind === "popunder" && str(raw.isolation) === "frame") return bad("A pop-under has to run in the page: it cannot be isolated in a frame.");

  const priority = blank(raw.priority) ? 0 : intIn(raw.priority, -100, 100);
  if (priority === null) return bad("Priority must be a whole number between -100 and 100.");
  const weight = blank(raw.weight) ? 1 : intIn(raw.weight, 1, 100);
  if (weight === null) return bad("Weight must be a whole number between 1 and 100.");

  const startsAt = when(raw.startsAt);
  const endsAt = when(raw.endsAt);
  if (startsAt === undefined || endsAt === undefined) return bad("The start and end must be valid dates.");
  if (startsAt && endsAt && endsAt <= startsAt) return bad("The end must be after the start.");

  const active = raw.active === true || raw.active === "true" || raw.active === "on" || raw.active === "1";
  const note = str(raw.note).trim().slice(0, 500) || null;

  return { ok: true, data: { slot, name, type, device, code, imageUrl, linkUrl, alt, width, height, isolation, priority, weight, startsAt, endsAt, active, note } };
}
