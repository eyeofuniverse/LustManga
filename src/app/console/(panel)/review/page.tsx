import { loadReview } from "@/lib/admin/queries";
import { ReviewView } from "@/components/console/views/ReviewView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review queue" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  return <ReviewView d={await loadReview(await searchParams)} />;
}
