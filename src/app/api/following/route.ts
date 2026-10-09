import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PREFS_COOKIE } from "@/lib/prefs";
import { prefsFromCookie } from "@/lib/prefs-server";
import { listWorks, prefFilters, resolveTagRefs, tagTypeOf } from "@/lib/queries";
import { idParam, intParam } from "@/lib/url";

export const dynamic = "force-dynamic";

/** Most things a visitor can follow (kept in step with MAX_FOLLOWS in lib/library.ts, which is client-only). */
const MAX_IDS = 60;

/** The newest works carrying any of the followed tags, with the visitor's language and hidden-tag choices applied. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  // what the visitor follows, as "type:slug" (survives a merge of two spellings of one tag), or as plain ids
  const refs = (sp.get("t") ?? "")
    .split(",")
    .slice(0, MAX_IDS)
    .map((s) => {
      const [type, ...rest] = s.split(":");
      const t = tagTypeOf(type ?? "");
      const slug = rest.join(":");
      return t && slug && slug.length <= 120 ? { type: t, slug } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const plain = (sp.get("ids") ?? "")
    .split(",")
    .map((s) => idParam(s))
    .filter((n): n is number => n != null)
    .slice(0, MAX_IDS);
  if (!refs.length && !plain.length) return NextResponse.json({ items: [], hasNext: false });
  const prefs = await prefsFromCookie((await cookies()).get(PREFS_COOKIE)?.value);
  try {
    const ids = refs.length ? await resolveTagRefs(refs) : plain;
    if (!ids.length) return NextResponse.json({ items: [], hasNext: false });
    const r = await listWorks({ anyTags: ids, sort: "new", page: intParam(sp.get("page") ?? undefined, 1, 1, 200), pageSize: 24, ...prefFilters(prefs) });
    return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ items: [], hasNext: false }, { status: 500 });
  }
}
