import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";
import { listingMetadata } from "@/lib/seo";

export const generateMetadata = ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> =>
  listingMetadata({ title: "Doujinshi by Parody: Every Source Series", description: "Every series that doujinshi on LustManga are based on, by popularity or A to Z. Read parody doujinshi of your favourite anime, games and manga free.", base: "/parodies", searchParams });

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <TagDirectory
      type="PARODY"
      slug="parody"
      title="Parodies"
      sub="Works based on your favourite series"
      base="/parodies"
      searchParams={await searchParams}
      tabs={[
        { label: "Parodies", href: "/parodies", active: true },
        { label: "Characters", href: "/characters", active: false },
      ]}
    />
  );
}
