import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await revokeCurrentSession();
  return NextResponse.json({ ok: true });
}
