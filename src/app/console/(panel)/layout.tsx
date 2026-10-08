import { redirect } from "next/navigation";
import { prisma, db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/auth";
import { Nav, type NavItem } from "@/components/console/Nav";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const me = await getAdminSession();
  if (!me) redirect("/console/login");

  const [held, deferred, quarantined, failed, dups, reports] = await db(() =>
    Promise.all([
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT", deferFetch: false } }),
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT", deferFetch: true } }),
      prisma.suppressedSource.count({ where: { confirmedAt: null } }),
      prisma.chapter.count({ where: { status: "FAILED" } }),
      prisma.duplicateCandidate.count({ where: { status: "OPEN" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
    ]),
  ).catch(() => [0, 0, 0, 0, 0, 0]);

  const items: NavItem[] = [
    { href: "/console", label: "Dashboard" },
    { href: "/console/review", label: "Review queue", badge: held + deferred + quarantined || undefined },
    { href: "/console/reports", label: "Reports", badge: reports || undefined },
    { href: "/console/duplicates", label: "Duplicates", badge: dups || undefined },
    { href: "/console/works", label: "Works" },
    { href: "/console/tags", label: "Tags & safety" },
    { href: "/console/runs", label: "Ingest runs", badge: failed || undefined },
    { href: "/console/audit", label: "Audit log" },
  ];

  return (
    <div className="flex min-h-screen">
      <Nav items={items} email={me.email} />
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
