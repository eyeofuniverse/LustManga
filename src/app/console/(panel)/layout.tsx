import { redirect } from "next/navigation";
import { prisma, db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/auth";
import { Shell, type NavItem } from "@/components/console/Shell";

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
    { href: "/console", label: "Dashboard", icon: "dashboard", group: "Overview" },
    { href: "/console/review", label: "Review queue", icon: "review", group: "Moderation", badge: held + deferred + quarantined || undefined },
    { href: "/console/reports", label: "Reports", icon: "reports", group: "Moderation", badge: reports || undefined },
    { href: "/console/duplicates", label: "Duplicates", icon: "duplicates", group: "Moderation", badge: dups || undefined },
    { href: "/console/works", label: "Works", icon: "works", group: "Catalogue" },
    { href: "/console/tags", label: "Tags & safety", icon: "tags", group: "Catalogue" },
    { href: "/console/runs", label: "Ingest runs", icon: "runs", group: "System", badge: failed || undefined },
    { href: "/console/audit", label: "Audit log", icon: "audit", group: "System" },
  ];

  return (
    <Shell items={items} email={me.email} role={me.role}>
      {children}
    </Shell>
  );
}
