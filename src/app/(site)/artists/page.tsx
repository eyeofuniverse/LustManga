import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";
import { listingMetadata } from "@/lib/seo";

export const generateMetadata = ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> =>
  listingMetadata({ title: "Manga & Doujinshi Artists A-Z", description: "Every artist on LustManga, by popularity or A to Z. Follow your favourite creators and read all their manga and doujinshi online free.", base: "/artists", searchParams });

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <TagDirectory
      type="ARTIST"
      slug="artist"
      title="Artists"
      sub="Follow the people behind the work"
      base="/artists"
      searchParams={await searchParams}
      tabs={[
        { label: "Artists", href: "/artists", active: true },
        { label: "Groups", href: "/groups", active: false },
      ]}
    />
  );
}
