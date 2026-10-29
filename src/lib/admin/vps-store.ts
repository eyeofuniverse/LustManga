import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, db } from "@/lib/db";
import { appendHistory, cleanHistory, cleanSnapshot, historyPoint, SERVERS, type HistoryPoint, type ServerName, type Snapshot } from "@/lib/admin/vps";

/** The newest report per server and a day of history points live in the Setting table (no schema change). */
const LATEST = (s: ServerName) => `vps:latest:${s}`;
const HIST = (s: ServerName) => `vps:hist:${s}`;
const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Keep what an agent just reported. One writer per server and one report a minute, so a plain read-then-write is enough. */
export async function saveSnapshot(s: Snapshot): Promise<void> {
  const prev = await db(() => prisma.setting.findUnique({ where: { key: HIST(s.server) } }));
  const hist = appendHistory(prev?.value, historyPoint(s));
  await db(() =>
    prisma.$transaction([
      prisma.setting.upsert({ where: { key: LATEST(s.server) }, create: { key: LATEST(s.server), value: json(s) }, update: { value: json(s) } }),
      prisma.setting.upsert({ where: { key: HIST(s.server) }, create: { key: HIST(s.server), value: json(hist) }, update: { value: json(hist) } }),
    ]),
  );
}

/** The newest report from each server (null for one that has never reported). */
export async function readLatest(): Promise<Record<ServerName, Snapshot | null>> {
  const rows = await db(() => prisma.setting.findMany({ where: { key: { in: SERVERS.map((x) => LATEST(x.name)) } } }));
  const out = { "LP-Group": null, CKFood: null } as Record<ServerName, Snapshot | null>;
  for (const row of rows) {
    const stored = row.value as { at?: unknown } | null;
    const at = typeof stored?.at === "string" ? Date.parse(stored.at) : NaN;
    const snap = Number.isNaN(at) ? null : cleanSnapshot(row.value, at);
    if (snap) out[snap.server] = snap;
  }
  return out;
}

export async function readHistory(): Promise<Record<ServerName, HistoryPoint[]>> {
  const rows = await db(() => prisma.setting.findMany({ where: { key: { in: SERVERS.map((x) => HIST(x.name)) } } }));
  const out = { "LP-Group": [], CKFood: [] } as Record<ServerName, HistoryPoint[]>;
  for (const x of SERVERS) out[x.name] = cleanHistory(rows.find((r) => r.key === HIST(x.name))?.value);
  return out;
}
