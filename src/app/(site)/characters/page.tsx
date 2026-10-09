import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";
import { listingMetadata } from "@/lib/seo";

export const generateMetadata = ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> =>
  listingMetadata({ title: "Hentai Doujinshi by Character A-Z", description: "Every character featured on LustPages, by popularity or A to Z. Find doujinshi and manga starring your favourite characters and read them free.", base: "/characters", searchParams });

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <TagDirectory
      type="CHARACTER"
      slug="character"
      title="Characters"
      sub="Find works featuring your favourites"
      base="/characters"
      searchParams={await searchParams}
      tabs={[
        { label: "Parodies", href: "/parodies", active: false },
        { label: "Characters", href: "/characters", active: true },
      ]}
    />
  );
}
