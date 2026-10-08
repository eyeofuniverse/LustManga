import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";

export const metadata: Metadata = { title: "Artists", description: "Every artist, by popularity or A to Z.", alternates: { canonical: "/artists" } };

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
