import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { readPending } from "@/lib/admin/auth";
import { newTotpSecret, totpUri } from "@/lib/admin/totp";
import { SetupForm } from "@/components/console/auth/SetupForm";

export const dynamic = "force-dynamic";

export default async function ConsoleSetupPage() {
  const pending = await readPending();
  if (!pending || pending.kind !== "enroll") redirect("/console/login");

  let admin = await prisma.adminUser
    .findUnique({ where: { id: pending.adminId } })
    .catch(() => null);
  if (!admin || admin.totpEnabledAt) redirect("/console/login");

  if (!admin.totpSecret) {
    const secret = newTotpSecret();
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { totpSecret: secret },
    });
    admin = { ...admin, totpSecret: secret };
  }

  const uri = totpUri(admin.email, admin.totpSecret!);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return (
    <>
      <h2 className="mb-4 text-center font-display text-base font-bold">
        Set up two-factor authentication
      </h2>
      <SetupForm secret={admin.totpSecret!} qr={qr} />
    </>
  );
}
