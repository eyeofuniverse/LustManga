import { collect } from "@/lib/analytics/collect";

export const dynamic = "force-dynamic";

/**
 * The first-party analytics endpoint: page views, time on page, a few things visitors do, and real-user speed numbers.
 * Always answers with an empty body. The write is finished BEFORE answering rather than deferred: a serverless function may be
 * frozen once it has responded, and a lost write is a silent hole in the numbers. Nobody waits for the answer to a beacon, so
 * this costs the visitor nothing. See src/lib/analytics/collect.ts for what is refused and why. Set ANALYTICS_DEBUG=1 to log
 * (to the server log) why a request was skipped.
 */
export async function POST(req: Request) {
  const out = await collect(req);
  if (out.write) await out.write();
  return new Response(null, { status: out.status, headers: { "Cache-Control": "no-store" } });
}
