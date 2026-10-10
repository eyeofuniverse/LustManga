import { loadReports } from "@/lib/admin/queries";
import { ReportsView } from "@/components/console/views/ReportsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return <ReportsView d={await loadReports(await searchParams)} />;
}
