import { loadDuplicates } from "@/lib/admin/queries";
import { DuplicatesView } from "@/components/console/views/DuplicatesView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duplicates" };

export default async function DuplicatesPage() {
  return <DuplicatesView d={await loadDuplicates()} />;
}
