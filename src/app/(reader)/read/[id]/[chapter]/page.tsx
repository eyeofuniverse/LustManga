import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getReaderData } from "@/lib/queries";
import { pagesOf } from "@/lib/pages";
import { cdn } from "@/lib/cdn";
import { workHref } from "@/lib/format";
import { flatParams, idParam, intParam } from "@/lib/url";
import { cookies } from "next/headers";
import { Reader } from "@/components/reader/Reader";
import { AdSlot } from "@/components/ads/AdSlot";
import { serveAd } from "@/lib/ads/serve";

type Params = Promise<{ id: string; chapter: string }>;

// reader pages are thin on their own; the details page is what should rank
const ROBOTS = { index: false, follow: false };

/** The tab and the browser history say what is being read, not just "Reading". */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, chapter } = await params;
  const publicId = idParam(id);
  const number = Number.parseFloat(chapter);
  if (publicId == null || !Number.isFinite(number)) return { title: "Reading", robots: ROBOTS };
  const data = await getReaderData(publicId, number).catch(() => null);
  if (!data) return { title: "Reading", robots: ROBOTS };
  const multi = data.chapters.length > 1;
  return { title: multi ? `${data.work.title} - Chapter ${data.current.number}` : data.work.title, robots: ROBOTS };
}

export default async function ReadPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, chapter } = await params;
  const publicId = idParam(id);
  const number = Number.parseFloat(chapter);
  if (publicId == null || !Number.isFinite(number) || Math.abs(number) > 1_000_000) notFound();

  const data = await getReaderData(publicId, number);
  if (!data) {
    // a chapter that does not exist: fall back to the work page instead of a dead end
    const w = await getReaderData(publicId, 1).catch(() => null);
    if (w) redirect(workHref(w.work));
    notFound();
  }

  const pages = pagesOf({ id: data.current.id, pageData: data.current.pageData }, data.work.mediaId).map((p) => ({
    n: p.n,
    src: cdn(p.key)!,
    w: p.width,
    h: p.height,
  }));
  if (!pages.length) notFound();

  const sp = flatParams(await searchParams);
  const startPage = intParam(sp.p, 1, 1, pages.length);

  // The ad between pages. A tab whose ad slots kept coming up empty (a content blocker) is left alone from then on (see Reader).
  // Nothing is shown to robots, admins or when ads are switched off: serveAd says so by returning nothing.
  const quiet = (await cookies()).get("lm_rq")?.value === "1";
  const mid = quiet ? null : await serveAd("reader-mid");

  return (
    <Reader
      work={{ publicId: data.work.publicId, slug: data.work.slug, title: data.work.title }}
      chapter={{ number: data.current.number, title: data.current.title }}
      pages={pages}
      prev={data.prev}
      next={data.next}
      chapters={data.chapters.map((c) => ({ number: c.number }))}
      startPage={startPage}
      endAd={<AdSlot slot="reader-end" className="mt-6" />}
      midAd={mid ? { id: mid.id, slot: mid.slot, type: mid.type, code: mid.code, imageUrl: mid.imageUrl, alt: mid.alt, isolation: mid.isolation, width: mid.width, height: mid.height } : null}
      workPages={data.work.pageCount}
    />
  );
}
