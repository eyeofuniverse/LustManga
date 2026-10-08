import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getReaderData } from "@/lib/queries";
import { pagesOf } from "@/lib/pages";
import { cdn } from "@/lib/cdn";
import { workHref } from "@/lib/format";
import { flatParams, intParam } from "@/lib/url";
import { Reader } from "@/components/reader/Reader";

type Params = Promise<{ id: string; chapter: string }>;

export const metadata: Metadata = {
  title: "Reading",
  // reader pages are thin on their own; the details page is what should rank
  robots: { index: false, follow: false },
};

export default async function ReadPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, chapter } = await params;
  const publicId = Number.parseInt(id, 10);
  const number = Number.parseFloat(chapter);
  if (!Number.isInteger(publicId) || !Number.isFinite(number)) notFound();

  const data = await getReaderData(publicId, number);
  if (!data) {
    // a chapter that does not exist: fall back to the work page instead of a dead end
    const w = Number.isInteger(publicId) ? await getReaderData(publicId, 1).catch(() => null) : null;
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

  return (
    <Reader
      work={{ publicId: data.work.publicId, slug: data.work.slug, title: data.work.title }}
      chapter={{ number: data.current.number, title: data.current.title }}
      pages={pages}
      prev={data.prev}
      next={data.next}
      chapters={data.chapters.map((c) => ({ number: c.number }))}
      startPage={startPage}
    />
  );
}
