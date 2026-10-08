import type { Metadata } from "next";
import { TagDirectory } from "@/components/work/TagDirectory";

export const metadata: Metadata = { title: "All tags", description: "Every tag, by popularity or A to Z.", alternates: { canonical: "/tags" } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TagDirectory type="TAG" slug="tag" title="Tags" sub="Find exactly what you are in the mood for" base="/tags" searchParams={await searchParams} />;
}
