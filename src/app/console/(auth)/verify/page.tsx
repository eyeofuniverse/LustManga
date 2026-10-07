import { redirect } from "next/navigation";
import { readPending } from "@/lib/admin/auth";
import { VerifyForm } from "@/components/console/auth/VerifyForm";

export const dynamic = "force-dynamic";

export default async function ConsoleVerifyPage() {
  const pending = await readPending();
  if (!pending || pending.kind !== "totp") redirect("/console/login");
  return <VerifyForm />;
}
