import { NextResponse } from "next/server";
import { cdn } from "@/lib/cdn";
import { pagesOf } from "@/lib/pages";
import { getReaderData } from "@/lib/queries";
import { clientIp, makeLimiter } from "@/lib/ratelimit";
import { idParam } from "@/lib/url";

export const dynamic = "force-dynamic";

const tooMany = makeLimiter(60, 60_000);

/** The page list of one chapter, for "Download chapter". It is the same data the reader page already ships to every visitor. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = idParam(sp.get("id"));
  const chapter = Number.parseFloat(sp.get("chapter") ?? "");
  if (id == null || !Number.isFinite(chapter) || Math.abs(chapter) > 1_000_000) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (tooMany(clientIp(req))) return NextResponse.json({ error: "slow down" }, { status: 429 });
  try {
    const data = await getReaderData(id, chapter);
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    const pages = pagesOf({ id: data.current.id, pageData: data.current.pageData }, data.work.mediaId);
    return NextResponse.json(
      {
        title: data.work.title,
        number: data.current.number,
        chapters: data.chapters.length,
        pages: pages.map((p) => ({ src: cdn(p.key)! })),
        bytes: pages.reduce((n, p) => n + p.bytes, 0),
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
