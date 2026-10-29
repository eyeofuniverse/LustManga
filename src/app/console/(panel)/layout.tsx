import { redirect } from "next/navigation";
import { prisma, db } from "@/lib/db";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { Shell, type NavItem } from "@/components/console/Shell";
import { serverIssueCount } from "@/lib/admin/vps-data";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const me = await getAdminSession();
  if (!me) redirect("/console/login");

  const [held, deferred, failed, dups, reports, commentReports] = await db(() =>
    Promise.all([
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT", deferFetch: false } }),
      prisma.work.count({ where: { needsReview: true, publish: "DRAFT", deferFetch: true } }),
      prisma.chapter.count({ where: { status: "FAILED" } }),
      prisma.duplicateCandidate.count({ where: { status: "OPEN" } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.commentReport.count({ where: { status: "OPEN" } }),
    ]),
  ).catch(() => [0, 0, 0, 0, 0, 0]);
  // servers that need a look (infrastructure is for admins; a moderator never sees the screen, so skip the read)
  const serverIssues = hasRole(me, "ADMIN") ? await serverIssueCount().catch(() => 0) : 0;

  const items: NavItem[] = [
    { href: "/console", label: "Dashboard", icon: "dashboard", group: "Overview" },
    { href: "/console/analytics", label: "Analytics", icon: "analytics", group: "Overview" },
    ...(hasRole(me, "ADMIN") ? [{ href: "/console/ads", label: "Ads", icon: "ads" as const, group: "Overview" }] : []), // revenue: not for moderators
    { href: "/console/review", label: "Review queue", icon: "review", group: "Moderation", badge: held + deferred || undefined },
    { href: "/console/reports", label: "Reports", icon: "reports", group: "Moderation", badge: reports || undefined },
    { href: "/console/community", label: "Community", icon: "community", group: "Moderation", badge: commentReports || undefined },
    { href: "/console/duplicates", label: "Duplicates", icon: "duplicates", group: "Moderation", badge: dups || undefined },
    { href: "/console/works", label: "Works", icon: "works", group: "Catalogue" },
    { href: "/console/tags", label: "Tags & safety", icon: "tags", group: "Catalogue" },
    { href: "/console/runs", label: "Ingest runs", icon: "runs", group: "System", badge: failed || undefined },
    ...(hasRole(me, "ADMIN") ? [{ href: "/console/servers", label: "Servers", icon: "servers" as const, group: "System", badge: serverIssues || undefined }] : []),
    { href: "/console/audit", label: "Audit log", icon: "audit", group: "System" },
  ];

  return (
    <Shell items={items} email={me.email} role={me.role}>
      {children}
    </Shell>
  );
}
