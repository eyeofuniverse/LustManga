import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";
import { listingMetadata } from "@/lib/seo";

export const generateMetadata = ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> =>
  listingMetadata({ title: "All Tags - Browse Hentai Manga & Doujinshi by Tag", description: "Every tag on LustPages, by popularity or A to Z. Find manga and doujinshi by genre, kink, setting and more, and read them online free.", base: "/tags", searchParams });

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TagDirectory type="TAG" slug="tag" title="Tags" sub="Find exactly what you are in the mood for" base="/tags" searchParams={await searchParams} />;
}
