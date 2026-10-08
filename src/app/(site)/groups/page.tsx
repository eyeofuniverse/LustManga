import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";

export const metadata: Metadata = { title: "Groups & circles", description: "Every circle, by popularity or A to Z.", alternates: { canonical: "/groups" } };

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
