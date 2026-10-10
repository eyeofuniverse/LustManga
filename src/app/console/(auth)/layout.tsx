import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { AuthShell } from "@/components/console/auth/AuthShell";

export const dynamic = "force-dynamic";

export default async function ConsoleAuthLayout({ children }: { children: React.ReactNode }) {
  if (await getAdminSession()) redirect("/console");
  return <AuthShell>{children}</AuthShell>;
}
