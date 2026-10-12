import { loadCommunity } from "@/lib/admin/community";
import { CommunityView } from "@/components/console/views/CommunityView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community" };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  return <CommunityView d={await loadCommunity(await searchParams)} />;
}
