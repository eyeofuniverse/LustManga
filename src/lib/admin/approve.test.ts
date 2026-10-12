import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { DEFAULT_TERMS } from "@/lib/safety/classify";
import { approveBatch } from "./approve";

type Row = {
  id: string; publicId: number; slug: string; title: string; coverKey: string | null; pageCount: number;
  titleOriginal: string | null; titleNorm: string | null; altTitles: string[]; description: string | null; tags: { name: string }[];
};
const row = (over: Partial<Row> & { publicId: number }): Row => ({
  id: `id${over.publicId}`, slug: `work-${over.publicId}`, title: `Work ${over.publicId}`, coverKey: "c/x.webp", pageCount: 20,
  titleOriginal: null, titleNorm: null, altTitles: [], description: null, tags: [{ name: "glasses" }], ...over,
});

/** an in-memory stand-in for the transaction client that records what the batch asked of it */
function fake(rows: Row[]) {
  const calls = { find: [] as unknown[], updates: [] as { where: { id: { in: string[] } }; data: Record<string, unknown> }[], audit: [] as { data: Record<string, unknown>[] }[] };
  const tx = {
    work: {
      findMany: async (args: unknown) => (calls.find.push(args), rows),
      updateMany: async (a: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => (calls.updates.push(a), { count: a.where.id.in.length }),
    },
    auditLog: { createMany: async (a: { data: Record<string, unknown>[] }) => (calls.audit.push(a), { count: a.data.length }) },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}
const me = { id: "admin1", email: "me@example.com" };

test("works with images go live now; works without wait for the next ingest run; both are recorded as decided", async () => {
  const { tx, calls } = fake([row({ publicId: 1 }), row({ publicId: 2, coverKey: null, pageCount: 0 })]);
  const paths: string[][] = [];
  const r = await approveBatch(tx, me, {}, 10, DEFAULT_TERMS, (p) => paths.push(p));
  assert.deepEqual([r.scanned, r.approved, r.live, r.blocked], [2, 2, 1, 0]);
  const live = calls.updates.find((u) => u.data.publish === "PUBLISHED")!;
  const waiting = calls.updates.find((u) => !("publish" in u.data))!;
  assert.deepEqual(live.where.id.in, ["id1"]);
  assert.deepEqual(waiting.where.id.in, ["id2"]);
  for (const u of calls.updates) {
    assert.equal(u.data.needsReview, false);
    assert.equal(u.data.reviewDecision, "APPROVED");
    assert.equal(u.data.reviewedBy, "me@example.com");
    assert.ok(u.data.reviewedAt instanceof Date);
  }
  assert.deepEqual(paths, [["/g/1-work-1"]], "only the work that went live is announced");
});

test("every approved work gets its own audit row, marked as a bulk approval", async () => {
  const { tx, calls } = fake([row({ publicId: 5 }), row({ publicId: 6, coverKey: null })]);
  await approveBatch(tx, me, {}, 10, DEFAULT_TERMS, () => undefined);
  const data = calls.audit[0].data;
  assert.equal(data.length, 2);
  assert.deepEqual(data.map((d) => d.targetId), ["5", "6"]);
  for (const d of data) assert.deepEqual([d.action, d.targetType, d.actorEmail, d.actorId], ["work.approve", "work", "me@example.com", "admin1"]);
  assert.deepEqual(data.map((d) => (d.diff as { live: boolean; bulk: boolean }).live), [true, false]);
  assert.ok(data.every((d) => (d.diff as { bulk: boolean }).bulk === true));
});

test("an admin can approve a former hard-term false positive from the metadata-only queue", async () => {
  const { tx, calls } = fake([row({ publicId: 1 }), row({ publicId: 2, tags: [{ name: "loli" }] }), row({ publicId: 3 })]);
  const r = await approveBatch(tx, me, {}, 10, DEFAULT_TERMS, () => undefined);
  assert.deepEqual([r.scanned, r.approved, r.blocked], [3, 3, 0]);
  const approvedIds = calls.updates.flatMap((u) => u.where.id.in);
  assert.deepEqual(approvedIds.sort(), ["id1", "id2", "id3"]);
  assert.deepEqual(calls.audit[0].data.map((d) => d.targetId), ["1", "2", "3"]);
});

test("admins can review all title wording in metadata before approval", async () => {
  const hidden = [
    row({ publicId: 10, titleOriginal: "Some Title shota edition" }),
    row({ publicId: 11, titleNorm: " circle lolicon scans title " }),
    row({ publicId: 12, altTitles: ["another toddlercon name"] }),
  ];
  const { tx, calls } = fake(hidden);
  const r = await approveBatch(tx, me, {}, 10, DEFAULT_TERMS, () => undefined);
  assert.deepEqual([r.approved, r.blocked], [3, 0]);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.audit.length, 1);
});

test("only works really waiting for review are queried, in a stable order, with the caller's filter and limit", async () => {
  const { tx, calls } = fake([]);
  await approveBatch(tx, me, { deferFetch: false, id: { gt: "abc" } }, 50, DEFAULT_TERMS, () => undefined);
  const q = calls.find[0] as { where: { AND: unknown[] }; orderBy: unknown; take: number };
  assert.deepEqual(q.where.AND[0], { needsReview: true, publish: "DRAFT" });
  assert.deepEqual(q.where.AND[1], { deferFetch: false, id: { gt: "abc" } });
  assert.deepEqual(q.orderBy, { id: "asc" });
  assert.equal(q.take, 50);
});

test("nothing to approve changes nothing and says where it stopped", async () => {
  const { tx, calls } = fake([]);
  const r = await approveBatch(tx, me, {}, 10, DEFAULT_TERMS, () => assert.fail("nothing went live"));
  assert.deepEqual(r, { scanned: 0, approved: 0, live: 0, blocked: 0, last: null });
  assert.equal(calls.updates.length + calls.audit.length, 0);
});

test("the cursor is the last work looked at, even when it was one that was left in the queue", async () => {
  const { tx } = fake([row({ publicId: 1 }), row({ publicId: 2, tags: [{ name: "shotacon" }] })]);
  const r = await approveBatch(tx, me, {}, 10, DEFAULT_TERMS, () => undefined);
  assert.equal(r.last, "id2", "otherwise the next batch would pick the same blocked work up again, forever");
});
