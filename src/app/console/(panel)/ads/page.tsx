import { loadAdsOverview } from "@/lib/admin/ads";
import { AdsView } from "@/components/console/views/AdsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ads" };

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  return <AdsView d={await loadAdsOverview(sp.range)} />;
}
