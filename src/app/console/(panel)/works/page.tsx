import { loadWorks } from "@/lib/admin/queries";
import { WorksView } from "@/components/console/views/WorksView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Works" };

export default async function WorksPage({ searchParams }: { searchParams: Promise<{ q?: string; publish?: string; lang?: string; page?: string }> }) {
  return <WorksView d={await loadWorks(await searchParams)} />;
}
