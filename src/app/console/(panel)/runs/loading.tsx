import { ListSkeleton } from "@/components/console/skeletons";

export default function Loading() {
  return <ListSkeleton label="ingest runs" toolbar={false} />;
}
