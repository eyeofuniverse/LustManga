import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";

export const metadata: Metadata = { title: "Characters", description: "Every character, by popularity or A to Z.", alternates: { canonical: "/characters" } };

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
