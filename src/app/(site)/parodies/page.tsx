import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";

export const metadata: Metadata = { title: "Parodies", description: "Every series that doujinshi are based on.", alternates: { canonical: "/parodies" } };

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
