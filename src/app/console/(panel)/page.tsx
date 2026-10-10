import { loadDashboard } from "@/lib/admin/dashboard";
import { DashboardView } from "@/components/console/views/DashboardView";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  return <DashboardView d={await loadDashboard()} />;
}
