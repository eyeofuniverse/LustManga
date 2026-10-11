import { loadSlot } from "@/lib/admin/ads";
import { SlotView } from "@/components/console/views/SlotView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ad place" };

export default async function SlotPage({ params, searchParams }: { params: Promise<{ slot: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ slot }, sp] = await Promise.all([params, searchParams]);
  return <SlotView d={await loadSlot(slot, sp.range)} />;
}
