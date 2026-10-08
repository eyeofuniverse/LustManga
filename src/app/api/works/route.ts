import { NextResponse } from "next/server";
import { getCardsByIds } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Card data for specific works (the browser keeps favourites and history as ids only). */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  try {
    return NextResponse.json({ items: await getCardsByIds(ids) }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
