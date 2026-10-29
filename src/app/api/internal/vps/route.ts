import { createHash, timingSafeEqual } from "node:crypto";
import { cleanSnapshot } from "@/lib/admin/vps";
import { saveSnapshot } from "@/lib/admin/vps-store";
import { clientIp, makeLimiter } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const tooMany = makeLimiter(30, 60_000);
const MAX_BYTES = 256 * 1024;
const sha = (s: string) => createHash("sha256").update(s).digest();

/**
 * A server's agent reports its health here once a minute (see ops/vps-agent.py). Only a caller that knows VPS_AGENT_SECRET
 * is answered; everyone else gets the same 404 as a page that does not exist, so the route is not advertised.
 */
export async function POST(req: Request) {
  const secret = process.env.VPS_AGENT_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || secret.length < 24 || !timingSafeEqual(sha(given), sha(secret))) return new Response(null, { status: 404 });
  if (tooMany(clientIp(req))) return new Response(null, { status: 429 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return new Response(null, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const snap = cleanSnapshot(raw);
  if (!snap) return new Response(null, { status: 400 });
  await saveSnapshot(snap);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
