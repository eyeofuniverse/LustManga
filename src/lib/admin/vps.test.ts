import { test } from "node:test";
import assert from "node:assert/strict";
import { appendHistory, cleanSnapshot, historyPoint, HISTORY_MAX, issueCount, projectRows, recentDeployments, serverHealth, uptimeText, type Snapshot } from "./vps";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const host = { uptimeSec: 90_000, cpus: 2, cpuPct: 10, load: [0.2, 0.2, 0.2], memTotal: 4e9, memUsed: 2e9, swapTotal: 2e9, swapUsed: 0, diskTotal: 40e9, diskUsed: 10e9 } as Snapshot["host"];
const ctr = (over = {}) => ({ name: "app-1", state: "running", health: null, startedAt: "2026-10-30T10:00:00Z", restarts: 0, cpuPct: 1, mem: 1e8, ...over });
const snap = (server: "LP-Group" | "CKFood", over: Partial<Snapshot> = {}): Snapshot => ({ server, at: new Date(NOW - 30_000).toISOString(), host, containers: [], projects: [], ...over });
const proj = (name: string, over = {}) => ({ name, url: `https://${name}.test`, container: ctr(), probe: { status: 200, ms: 120 }, deployments: [], ...over });
const dep = (status: string, at: string, over = {}) => ({ id: at, status, commit: "abc1234", message: "m", createdAt: at, finishedAt: null, ...over });

test("cleanSnapshot refuses unknown servers and non-objects", () => {
  assert.equal(cleanSnapshot(null), null);
  assert.equal(cleanSnapshot("x"), null);
  assert.equal(cleanSnapshot({ server: "evil" }), null);
  assert.equal(cleanSnapshot([]), null);
});

test("cleanSnapshot stamps its own time and coerces and caps everything", () => {
  const s = cleanSnapshot(
    {
      server: "CKFood",
      at: "1999-01-01",
      host: { cpus: -3, cpuPct: 5000, load: ["x", 1], memTotal: "9", uptimeSec: 12.6 },
      containers: Array.from({ length: 200 }, (_, i) => ({ name: `c${i}`, state: "running", restarts: "9", mem: NaN })),
      projects: [
        { name: "lustpages", probe: { status: 200.4, ms: 9e9 }, deployments: [{ createdAt: "nope" }, { createdAt: "2026-10-30T11:00:00Z", message: "line one\nline two", status: "finished" }] },
        { name: "" },
      ],
    },
    NOW,
  )!;
  assert.equal(s.at, new Date(NOW).toISOString());
  assert.equal(s.host.cpus, 1);
  assert.equal(s.host.cpuPct, 100);
  assert.deepEqual(s.host.load, [0, 1, 0]);
  assert.equal(s.host.memTotal, 0);
  assert.equal(s.host.uptimeSec, 13);
  assert.equal(s.containers.length, 60);
  assert.equal(s.containers[0].restarts, 0);
  assert.equal(s.containers[0].mem, null);
  assert.equal(s.projects.length, 1);
  assert.equal(s.projects[0].probe?.status, 200);
  assert.equal(s.projects[0].probe?.ms, 600_000);
  assert.equal(s.projects[0].deployments.length, 1);
  assert.equal(s.projects[0].deployments[0].message, "line one");
});

test("serverHealth: healthy, late, down, and resource limits", () => {
  assert.equal(serverHealth(snap("CKFood"), NOW).level, "good");
  assert.equal(serverHealth(null, NOW).level, "bad");
  assert.equal(serverHealth(snap("CKFood", { at: new Date(NOW - 200_000).toISOString() }), NOW).level, "warn");
  assert.equal(serverHealth(snap("CKFood", { at: new Date(NOW - 400_000).toISOString() }), NOW).level, "bad");
  assert.equal(serverHealth(snap("CKFood", { host: { ...host, diskUsed: 37e9 } }), NOW).level, "bad");
  assert.equal(serverHealth(snap("CKFood", { host: { ...host, memUsed: 3.5e9 } }), NOW).level, "warn");
  const h = serverHealth(snap("CKFood", { host: { ...host, load: [5, 3, 2] } }), NOW);
  assert.equal(h.level, "warn");
  assert.match(h.reasons[0], /load/);
});

test("projectRows merges reports: containers from one server, deployments from the other", () => {
  const rows = projectRows({
    "LP-Group": snap("LP-Group", { projects: [proj("lustpages")] }),
    CKFood: snap("CKFood", {
      projects: [{ name: "lustpages", url: "", container: null, probe: null, deployments: [dep("finished", "2026-10-30T10:00:00Z"), dep("in_progress", "2026-10-30T11:00:00Z")] }],
    }),
  });
  const lp = rows.find((r) => r.name === "lustpages")!;
  assert.equal(lp.server, "LP-Group");
  assert.equal(lp.deploying, true);
  assert.equal(lp.latest?.status, "in_progress");
  assert.equal(lp.level, "good");
  assert.deepEqual(rows.map((r) => r.name), ["lustpages", "lusthentai", "bizcase", "ckfood-balance", "bizcase-doc"]);
  assert.equal(rows.find((r) => r.name === "bizcase")!.level, "bad"); // nobody reported it
});

test("projectRows: a stopped container, an unhealthy one, a 5xx and a slow answer", () => {
  const level = (over: object) => projectRows({ CKFood: snap("CKFood", { projects: [proj("bizcase", over)] }) }).find((r) => r.name === "bizcase")!.level;
  assert.equal(level({}), "good");
  assert.equal(level({ container: ctr({ state: "exited" }) }), "bad");
  assert.equal(level({ container: ctr({ health: "unhealthy" }) }), "bad");
  assert.equal(level({ container: ctr({ health: "starting" }) }), "warn");
  assert.equal(level({ probe: { status: 502, ms: 5 } }), "bad");
  assert.equal(level({ probe: { status: 0, ms: 5 } }), "bad");
  assert.equal(level({ probe: { status: 307, ms: 5 } }), "good");
  assert.equal(level({ probe: { status: 200, ms: 6000 } }), "warn");
  assert.equal(level({ container: ctr({ restarts: 4 }) }), "warn");
});

test("a failed build warns only while it is the newest finished one", () => {
  const level = (deployments: object[]) => projectRows({ CKFood: snap("CKFood", { projects: [proj("bizcase", { deployments })] }) }).find((r) => r.name === "bizcase")!.level;
  assert.equal(level([dep("failed", "2026-10-30T11:00:00Z"), dep("finished", "2026-10-30T10:00:00Z")]), "warn");
  assert.equal(level([dep("finished", "2026-10-30T12:00:00Z"), dep("failed", "2026-10-30T11:00:00Z")]), "good");
  assert.equal(level([dep("in_progress", "2026-10-30T12:00:00Z"), dep("failed", "2026-10-30T11:00:00Z")]), "warn");
});

test("recentDeployments is newest first across projects", () => {
  const rows = projectRows({
    CKFood: snap("CKFood", {
      projects: [proj("bizcase", { deployments: [dep("finished", "2026-10-30T10:00:00Z")] }), proj("lustpages", { deployments: [dep("finished", "2026-10-30T11:00:00Z")] })],
    }),
  });
  assert.deepEqual(recentDeployments(rows).map((d) => d.project), ["lustpages", "bizcase"]);
});

const allFine = () => ({
  "LP-Group": snap("LP-Group", { projects: [proj("lustpages"), proj("lusthentai")] }),
  CKFood: snap("CKFood", { projects: [proj("bizcase"), proj("ckfood-balance"), proj("bizcase-doc")] }),
});

test("issueCount counts servers and projects that are not fine", () => {
  assert.equal(issueCount(allFine(), NOW), 0);
  assert.equal(issueCount({ ...allFine(), CKFood: null }, NOW), 1 + 3); // the server, plus the three projects only it reports
});

test("history: one point per five minutes, a day at most, junk dropped", () => {
  const p = historyPoint(snap("CKFood"));
  let h = appendHistory(undefined, p);
  assert.equal(h.length, 1);
  h = appendHistory(h, { ...p, t: p.t + 60_000 });
  assert.equal(h.length, 1); // a minute later: not yet
  h = appendHistory(h, { ...p, t: p.t + 300_000 });
  assert.equal(h.length, 2);
  assert.equal(appendHistory([{ t: "x" }, null, ...h], { ...p, t: p.t + 900_000 }).length, 3);
  let big = h;
  for (let i = 0; i < HISTORY_MAX + 10; i++) big = appendHistory(big, { ...p, t: p.t + 600_000 + i * 300_000 });
  assert.equal(big.length, HISTORY_MAX);
});

test("uptimeText", () => {
  assert.equal(uptimeText(0), "–");
  assert.equal(uptimeText(42 * 60), "42m");
  assert.equal(uptimeText(5 * 3600 + 12 * 60), "5h 12m");
  assert.equal(uptimeText(3 * 86400 + 4 * 3600), "3d 4h");
});
