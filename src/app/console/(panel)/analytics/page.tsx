import { loadAnalytics } from "@/lib/admin/analytics";
import { AnalyticsView } from "@/components/console/views/AnalyticsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string }> }) {
  const sp = await searchParams;
  const { range, ...data } = await loadAnalytics(sp.tab, sp.range);
  return <AnalyticsView data={data} range={range} />;
}
