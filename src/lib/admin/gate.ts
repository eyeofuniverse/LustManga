/**
 * The "gate" token proves a request arrived through the secret entry URL
 * (`/console?k=<ADMIN_ENTRY_TOKEN>`). It's an HMAC over an expiry, verifiable in
 * both the edge middleware and Node server components with Web Crypto — no DB.
 *
 * It does NOT authenticate anyone; it only un-hides the console so a scanner
 * hitting `/console/*` cold gets a 404, not a login page.
 */
const SECRET =
  process.env.ADMIN_GATE_SECRET ||
  process.env.STREAM_SECRET ||
  process.env.CRON_SECRET ||
  "insecure-dev-gate-secret";

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a gate token good for `ttlMs` (default 30 min). */
export async function signGate(ttlMs = 30 * 60_000): Promise<string> {
  const exp = Date.now() + ttlMs;
  return `${exp}.${await sign(`gate.${exp}`)}`;
}

export async function verifyGate(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isFinite(exp) || Date.now() > exp || !sig) return false;
  return safeEqual(await sign(`gate.${exp}`), sig);
}

/** Constant-time string compare (for the entry token). */
export function tokenEqual(a: string, b: string): boolean {
  return safeEqual(a, b);
}
