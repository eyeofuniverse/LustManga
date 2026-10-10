import { loadTags } from "@/lib/admin/queries";
import { TagsView } from "@/components/console/views/TagsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tags & safety" };

type SP = { q?: string; type?: string; sort?: string; flag?: string; page?: string; view?: string };

export default async function TagsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return <TagsView d={await loadTags(await searchParams)} />;
}
