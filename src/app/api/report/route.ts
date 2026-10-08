import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/ratelimit";
import { MAX_INT } from "@/lib/url";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Body = z.object({
  kind: z.enum(["DMCA", "BROKEN", "OTHER"]),
  work: z.coerce.number().int().positive().max(MAX_INT).optional(),
  details: z.string().trim().min(10, "Please describe the problem (at least 10 characters).").max(4000),
  contact: z.string().trim().max(200).optional(),
});

/** Visitor reports (takedown requests, broken pages, anything else). Rate-limited per visitor; stored for the console. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid report" }, { status: 400 });
  const b = parsed.data;
  if (b.kind === "DMCA" && !EMAIL.test(b.contact ?? "")) return NextResponse.json({ ok: false, error: "A takedown request needs a valid email address so we can reply." }, { status: 400 });

  const ip = clientIp(req);
  // a one-way hash, only ever used to limit abuse
  const ipHash = createHash("sha256").update(`${ip}|${process.env.ADMIN_GATE_SECRET ?? ""}`).digest("hex").slice(0, 32);
  const recent = await prisma.report.count({ where: { ipHash, createdAt: { gt: new Date(Date.now() - 3600_000) } } }).catch(() => 0);
  if (recent >= 5) return NextResponse.json({ ok: false, error: "Too many reports from you recently. Please try again later." }, { status: 429 });

  await prisma.report.create({ data: { kind: b.kind, workId: b.work ?? null, details: b.details, contact: b.contact || null, ipHash } });
  return NextResponse.json({ ok: true });
}
