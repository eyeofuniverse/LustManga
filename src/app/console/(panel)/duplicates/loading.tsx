import { CardsSkeleton } from "@/components/console/skeletons";

export default function Loading() {
  return <CardsSkeleton label="duplicates" count={2} tabs={false} />;
}
