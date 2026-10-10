import { loadAudit } from "@/lib/admin/queries";
import { AuditView } from "@/components/console/views/AuditView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <AuditView d={await loadAudit(await searchParams)} />;
}
