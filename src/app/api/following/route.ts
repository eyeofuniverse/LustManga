import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { listWorks, prefFilters } from "@/lib/queries";
import { idParam, intParam } from "@/lib/url";

export const dynamic = "force-dynamic";

/** Most things a visitor can follow (kept in step with MAX_FOLLOWS in lib/library.ts, which is client-only). */
const MAX_IDS = 60;

/** The newest works carrying any of the followed tags, with the visitor's language and hidden-tag choices applied. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const ids = (sp.get("ids") ?? "")
    .split(",")
    .map((s) => idParam(s))
    .filter((n): n is number => n != null)
    .slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({ items: [], hasNext: false });
  const prefs = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  try {
    const r = await listWorks({ anyTags: ids, sort: "new", page: intParam(sp.get("page") ?? undefined, 1, 1, 200), pageSize: 24, ...prefFilters(prefs) });
    return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ items: [], hasNext: false }, { status: 500 });
  }
}
