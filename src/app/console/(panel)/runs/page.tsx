import { loadRuns } from "@/lib/admin/queries";
import { RunsView } from "@/components/console/views/RunsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ingest runs" };

export default async function RunsPage() {
  return <RunsView d={await loadRuns()} />;
}
