import { ListSkeleton } from "@/components/console/skeletons";

export default function Loading() {
  return <ListSkeleton label="the audit log" rows={10} />;
}
