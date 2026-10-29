/**
 * The servers dashboard: what each server's agent reports, how that is cleaned and judged, and how the two reports are
 * merged into one row per project. Pure functions (no database, no framework), so each is unit-tested.
 *
 * Each server runs a small agent (ops/vps-agent.py) that posts one snapshot a minute to /api/internal/vps. The newest
 * snapshot per server and a day of 5-minute history points are kept in the Setting table.
 */

export const SERVERS = [
  { name: "LP-Group", hosts: "LustPages · LustHentai" },
  { name: "CKFood", hosts: "Coolify · business apps" },
] as const;
export type ServerName = (typeof SERVERS)[number]["name"];
export const isServerName = (s: unknown): s is ServerName => SERVERS.some((x) => x.name === s);

/** the projects, in the order the dashboard lists them */
export const PROJECTS = ["lustpages", "lusthentai", "bizcase", "ckfood-balance", "bizcase-doc"] as const;

export interface HostStats {
  uptimeSec: number;
  cpus: number;
  cpuPct: number;
  load: [number, number, number];
  memTotal: number;
  memUsed: number;
  swapTotal: number;
  swapUsed: number;
  diskTotal: number;
  diskUsed: number;
}
export interface ContainerStat {
  name: string;
  /** docker's state: running, restarting, exited, ... */
  state: string;
  /** healthy / unhealthy / starting, or null when the image has no health check */
  health: string | null;
  startedAt: string | null;
  restarts: number;
  cpuPct: number | null;
  mem: number | null;
}
export interface DeploymentStat {
  id: string;
  /** Coolify's word: queued, in_progress, finished, failed, cancelled-by-user */
  status: string;
  commit: string;
  message: string;
  createdAt: string;
  finishedAt: string | null;
}
export interface ProjectStat {
  name: string;
  url: string;
  container: ContainerStat | null;
  /** the app's answer when asked directly (not through Cloudflare): HTTP status (0 = no answer) and milliseconds */
  probe: { status: number; ms: number } | null;
  deployments: DeploymentStat[];
}
export interface Snapshot {
  server: ServerName;
  /** when we received it (the agent's own clock is not trusted) */
  at: string;
  host: HostStats;
  containers: ContainerStat[];
  projects: ProjectStat[];
}
export interface HistoryPoint {
  t: number;
  cpu: number;
  mem: number;
  disk: number;
}

const MAX_CONTAINERS = 60;
const MAX_PROJECTS = 12;
const MAX_DEPLOYMENTS = 8;

const num = (v: unknown, max = 1e15): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);
const numOrNull = (v: unknown, max = 1e15): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : null);
const str = (v: unknown, n = 200): string => (typeof v === "string" ? v.slice(0, n) : "");
const iso = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) || t < Date.UTC(2000, 0, 1) ? null : new Date(t).toISOString();
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function cleanContainer(raw: unknown): ContainerStat | null {
  const c = obj(raw);
  const name = str(c.name, 120);
  if (!name) return null;
  const health = str(c.health, 20);
  return {
    name,
    state: str(c.state, 20) || "unknown",
    health: health || null,
    startedAt: iso(c.startedAt),
    restarts: Math.round(num(c.restarts, 1e6)),
    cpuPct: numOrNull(c.cpuPct, 100_000),
    mem: numOrNull(c.mem),
  };
}

function cleanDeployment(raw: unknown): DeploymentStat | null {
  const d = obj(raw);
  const createdAt = iso(d.createdAt);
  if (!createdAt) return null;
  return {
    id: str(d.id, 60),
    status: str(d.status, 40) || "unknown",
    commit: str(d.commit, 40),
    message: str(d.message, 160).split("\n")[0],
    createdAt,
    finishedAt: iso(d.finishedAt),
  };
}

/** What the ingest route accepts: anything shaped like a snapshot, with every field coerced and capped. Null when it is not one. */
export function cleanSnapshot(raw: unknown, now = Date.now()): Snapshot | null {
  const r = obj(raw);
  if (!isServerName(r.server)) return null;
  const h = obj(r.host);
  const load = arr(h.load).map((x) => num(x, 10_000));
  const projects: ProjectStat[] = [];
  for (const p of arr(r.projects).slice(0, MAX_PROJECTS)) {
    const o = obj(p);
    const name = str(o.name, 60);
    if (!name) continue;
    const probe = obj(o.probe);
    projects.push({
      name,
      url: str(o.url, 200),
      container: o.container ? cleanContainer(o.container) : null,
      probe: o.probe ? { status: Math.round(num(probe.status, 999)), ms: Math.round(num(probe.ms, 600_000)) } : null,
      deployments: arr(o.deployments).slice(0, MAX_DEPLOYMENTS).map(cleanDeployment).filter((d): d is DeploymentStat => !!d),
    });
  }
  return {
    server: r.server,
    at: new Date(now).toISOString(),
    host: {
      uptimeSec: Math.round(num(h.uptimeSec)),
      cpus: Math.max(1, Math.round(num(h.cpus, 4096))),
      cpuPct: num(h.cpuPct, 100),
      load: [load[0] ?? 0, load[1] ?? 0, load[2] ?? 0],
      memTotal: num(h.memTotal),
      memUsed: num(h.memUsed),
      swapTotal: num(h.swapTotal),
      swapUsed: num(h.swapUsed),
      diskTotal: num(h.diskTotal),
      diskUsed: num(h.diskUsed),
    },
    containers: arr(r.containers).slice(0, MAX_CONTAINERS).map(cleanContainer).filter((c): c is ContainerStat => !!c),
    projects,
  };
}

/* ───────────────────────────── judging ───────────────────────────── */

export type Level = "good" | "warn" | "bad";
const worst = (a: Level, b: Level): Level => (a === "bad" || b === "bad" ? "bad" : a === "warn" || b === "warn" ? "warn" : "good");

/** no report for this long: the agent (or the whole server) is not answering */
export const SILENT_AFTER_MS = 150_000;
export const DOWN_AFTER_MS = 300_000;

export const pct = (used: number, total: number): number => (total > 0 ? Math.min(100, (used / total) * 100) : 0);

export interface ServerHealth {
  level: Level;
  /** the first things wrong, in words */
  reasons: string[];
  cpu: number;
  mem: number;
  disk: number;
  swap: number;
  ageMs: number;
}

export function serverHealth(s: Snapshot | null, now = Date.now()): ServerHealth {
  if (!s) return { level: "bad", reasons: ["no report received yet"], cpu: 0, mem: 0, disk: 0, swap: 0, ageMs: Infinity };
  const ageMs = Math.max(0, now - new Date(s.at).getTime());
  const cpu = s.host.cpuPct;
  const mem = pct(s.host.memUsed, s.host.memTotal);
  const disk = pct(s.host.diskUsed, s.host.diskTotal);
  const swap = pct(s.host.swapUsed, s.host.swapTotal);
  let level: Level = "good";
  const reasons: string[] = [];
  const flag = (l: Level, why: string) => {
    level = worst(level, l);
    reasons.push(why);
  };
  if (ageMs > DOWN_AFTER_MS) flag("bad", "not reporting (server or agent is down)");
  else if (ageMs > SILENT_AFTER_MS) flag("warn", "report is late");
  if (disk >= 92) flag("bad", `disk ${Math.round(disk)}% full`);
  else if (disk >= 80) flag("warn", `disk ${Math.round(disk)}% full`);
  if (mem >= 95) flag("bad", `memory ${Math.round(mem)}% used`);
  else if (mem >= 85) flag("warn", `memory ${Math.round(mem)}% used`);
  if (cpu >= 90) flag("warn", `processor ${Math.round(cpu)}% busy`);
  if (s.host.load[0] / s.host.cpus >= 2) flag("warn", `load ${s.host.load[0].toFixed(1)} on ${s.host.cpus} processors`);
  if (swap >= 60) flag("warn", `swap ${Math.round(swap)}% used`);
  return { level, reasons, cpu, mem, disk, swap, ageMs };
}

/** a deployment that has not finished: Coolify calls these queued or in_progress */
export const isActiveDeployment = (d: DeploymentStat): boolean => d.status === "queued" || d.status === "in_progress";
export const isFailedDeployment = (d: DeploymentStat): boolean => d.status === "failed";

export interface ProjectRow {
  name: string;
  url: string;
  server: ServerName | null;
  container: ContainerStat | null;
  probe: { status: number; ms: number } | null;
  deployments: DeploymentStat[];
  /** the newest deployment, if any */
  latest: DeploymentStat | null;
  deploying: boolean;
  level: Level;
  reasons: string[];
}

/** One row per project, merged from every server's report: a container and its probe come from the server that runs it, deployments from the one that runs Coolify. */
export function projectRows(snaps: Partial<Record<ServerName, Snapshot | null>>): ProjectRow[] {
  const by = new Map<string, ProjectRow>();
  const blank = (name: string): ProjectRow => ({ name, url: "", server: null, container: null, probe: null, deployments: [], latest: null, deploying: false, level: "bad", reasons: [] });
  for (const name of PROJECTS) by.set(name, blank(name));
  for (const server of SERVERS.map((x) => x.name)) {
    for (const p of snaps[server]?.projects ?? []) {
      const row = by.get(p.name) ?? blank(p.name);
      by.set(p.name, row);
      if (p.url) row.url = p.url;
      if (p.container) {
        row.container = p.container;
        row.server = server;
      }
      if (p.probe) row.probe = p.probe;
      if (p.deployments.length) row.deployments = p.deployments;
    }
  }
  for (const row of by.values()) {
    row.deployments = [...row.deployments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    row.latest = row.deployments[0] ?? null;
    row.deploying = row.deployments.some(isActiveDeployment);
    let level: Level = "good";
    const flag = (l: Level, why: string) => {
      level = worst(level, l);
      row.reasons.push(why);
    };
    if (!row.container) flag("bad", "no container reported");
    else if (row.container.state !== "running") flag("bad", `container ${row.container.state}`);
    else if (row.container.health === "unhealthy") flag("bad", "container unhealthy");
    else if (row.container.health === "starting") flag("warn", "container starting");
    if (row.container && row.container.restarts >= 3) flag("warn", `restarted ${row.container.restarts} times`);
    if (row.probe && (row.probe.status === 0 || row.probe.status >= 500)) flag("bad", row.probe.status === 0 ? "site does not answer" : `site answers ${row.probe.status}`);
    else if (row.probe && row.probe.ms > 5000) flag("warn", `slow answer (${(row.probe.ms / 1000).toFixed(1)}s)`);
    // only the newest finished build matters: an old failure that a later build fixed is history
    const finished = row.deployments.find((d) => !isActiveDeployment(d));
    if (finished && isFailedDeployment(finished)) flag("warn", "last build failed (the previous version is still running)");
    row.level = level;
  }
  const order = (n: string) => (PROJECTS as readonly string[]).indexOf(n);
  return [...by.values()].sort((a, b) => order(a.name) - order(b.name));
}

/** the newest deployments across every project, for the activity list */
export function recentDeployments(rows: ProjectRow[], take = 15): (DeploymentStat & { project: string })[] {
  return rows
    .flatMap((r) => r.deployments.map((d) => ({ ...d, project: r.name })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, take);
}

/** how many things need a look: servers not good plus projects that are down (the badge on the nav item) */
export function issueCount(snaps: Partial<Record<ServerName, Snapshot | null>>, now = Date.now()): number {
  const servers = SERVERS.filter((x) => serverHealth(snaps[x.name] ?? null, now).level !== "good").length;
  const projects = projectRows(snaps).filter((r) => r.level === "bad").length;
  return servers + projects;
}

/* ───────────────────────────── history ───────────────────────────── */

export const HISTORY_STEP_MS = 270_000; // one point per ~5 minutes (a little under, so a minute of jitter never skips one)
export const HISTORY_MAX = 288; // a day

export function historyPoint(s: Snapshot, t = new Date(s.at).getTime()): HistoryPoint {
  return {
    t,
    cpu: Math.round(s.host.cpuPct * 10) / 10,
    mem: Math.round(pct(s.host.memUsed, s.host.memTotal) * 10) / 10,
    disk: Math.round(pct(s.host.diskUsed, s.host.diskTotal) * 10) / 10,
  };
}

/** Stored history points, with anything that is not a valid one dropped. */
export function cleanHistory(prev: unknown): HistoryPoint[] {
  return arr(prev)
    .map(obj)
    .filter((p) => [p.t, p.cpu, p.mem, p.disk].every((n) => typeof n === "number" && Number.isFinite(n)))
    .map((p) => ({ t: p.t as number, cpu: p.cpu as number, mem: p.mem as number, disk: p.disk as number }));
}

/** Add a point when the last one is old enough; keep a day. */
export function appendHistory(prev: unknown, point: HistoryPoint): HistoryPoint[] {
  const ok = cleanHistory(prev);
  const last = ok[ok.length - 1];
  if (last && point.t - last.t < HISTORY_STEP_MS) return ok.slice(-HISTORY_MAX);
  return [...ok, point].slice(-HISTORY_MAX);
}

/** "3d 4h", "5h 12m", "42m" */
export function uptimeText(sec: number): string {
  if (!(sec > 0)) return "–";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
