import { CardsSkeleton } from "@/components/console/skeletons";

export default function Loading() {
  return <CardsSkeleton label="the review queue" count={3} />;
}
