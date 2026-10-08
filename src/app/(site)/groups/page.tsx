import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";
import { listingMetadata } from "@/lib/seo";

export const generateMetadata = ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> =>
  listingMetadata({ title: "Doujinshi Circles & Groups A-Z", description: "Every doujin circle and group on LustManga, by popularity or A to Z. Read each circle's doujinshi and manga online free.", base: "/groups", searchParams });

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <TagDirectory
      type="GROUP"
      slug="group"
      title="Groups"
      sub="Circles and studios"
      base="/groups"
      searchParams={await searchParams}
      tabs={[
        { label: "Artists", href: "/artists", active: false },
        { label: "Groups", href: "/groups", active: true },
      ]}
    />
  );
}
