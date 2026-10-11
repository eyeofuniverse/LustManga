import { ListSkeleton } from "@/components/console/skeletons";

export default function Loading() {
  return <ListSkeleton label="tags and safety terms" rows={6} toolbar={false} />;
}
