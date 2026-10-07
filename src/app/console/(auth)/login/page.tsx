import { prisma } from "@/lib/db";
import { LoginForm } from "@/components/console/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function ConsoleLoginPage() {
  const count = await prisma.adminUser.count().catch(() => 1);
  return <LoginForm needsBootstrap={count === 0} />;
}
