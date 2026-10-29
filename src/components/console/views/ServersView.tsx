import { CheckCircle2, Rocket, Server, TriangleAlert } from "lucide-react";
import type { ServersData } from "@/lib/admin/vps-data";
import { isActiveDeployment, pct, uptimeText, type ContainerStat, type DeploymentStat, type Level, type ProjectRow } from "@/lib/admin/vps";
import { ago, duration, fmtBytes } from "@/lib/admin/format";
import { AutoRefresh } from "../AutoRefresh";
import { Spark } from "../Spark";
import { Badge, Card, Empty, Note, PageHeader, SectionTitle, Stat, type Tone } from "../ui";

const TONE: Record<Level, Tone> = { good: "good", warn: "warn", bad: "bad" };
const LABEL: Record<Level, string> = { good: "healthy", warn: "needs a look", bad: "problem" };

function deployTone(d: DeploymentStat): { tone: Tone; label: string } {
  if (d.status === "finished") return { tone: "good", label: "deployed" };
  if (d.status === "failed") return { tone: "bad", label: "failed" };
  if (d.status === "in_progress") return { tone: "info", label: "building" };
  if (d.status === "queued") return { tone: "info", label: "queued" };
  if (d.status.startsWith("cancelled")) return { tone: "muted", label: "cancelled" };
  return { tone: "muted", label: d.status.replace(/_/g, " ") };
}

/** a labelled usage bar; turns amber and red as it fills */
function Meter({ label, value, detail }: { label: string; value: number; detail: string }) {
  const tone = value >= 90 ? "bg-bad" : value >= 75 ? "bg-warn" : "bg-accent";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted">{detail}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.round(value))}%` }} />
      </div>
    </div>
  );
}

function ServerCard({ s, now }: { s: ServersData["servers"][number]; now: number }) {
  const h = s.snap?.host;
  return (
    <Card edge={TONE[s.health.level]} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold">{s.name}</h3>
          <p className="text-xs text-muted">{s.hosts}</p>
        </div>
        <Badge tone={TONE[s.health.level]} dot>{LABEL[s.health.level]}</Badge>
      </div>
      {h ? (
        <>
          <div className="space-y-3">
            <Meter label="Processor" value={s.health.cpu} detail={`${Math.round(s.health.cpu)}% of ${h.cpus} cores · load ${h.load.map((n) => n.toFixed(2)).join(" ")}`} />
            <Meter label="Memory" value={s.health.mem} detail={`${fmtBytes(h.memUsed)} of ${fmtBytes(h.memTotal)}`} />
            <Meter label="Disk" value={s.health.disk} detail={`${fmtBytes(h.diskUsed)} of ${fmtBytes(h.diskTotal)}`} />
            {h.swapTotal > 0 && <Meter label="Swap" value={s.health.swap} detail={`${fmtBytes(h.swapUsed)} of ${fmtBytes(h.swapTotal)}`} />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Spark points={s.history} pick={(p) => p.cpu} label="Processor" now={now} />
            <Spark points={s.history} pick={(p) => p.mem} label="Memory" className="text-info" now={now} />
          </div>
          <p className="text-xs text-muted">Up {uptimeText(h.uptimeSec)} · reported {ago(s.snap!.at, now)}</p>
        </>
      ) : (
        <Empty title="No report yet" hint="The agent on this server has not reported. It runs every minute once installed." icon={<Server className="h-5 w-5" />} />
      )}
      {s.health.reasons.length > 0 && <Note tone={s.health.level === "bad" ? "bad" : "warn"} icon={<TriangleAlert className="h-4 w-4" />}>{s.health.reasons.join(" · ")}</Note>}
    </Card>
  );
}

function ContainerCell({ c }: { c: ContainerStat | null }) {
  if (!c) return <span className="text-muted">not found</span>;
  const tone: Tone = c.state !== "running" || c.health === "unhealthy" ? "bad" : c.health === "starting" ? "warn" : "good";
  return (
    <div className="space-y-1">
      <Badge tone={tone} dot>{c.state}{c.health ? ` · ${c.health}` : ""}</Badge>
      <p className="text-xs tabular-nums text-muted">
        {c.startedAt ? `up ${uptimeText((Date.now() - new Date(c.startedAt).getTime()) / 1000)}` : "–"}
        {c.mem != null ? ` · ${fmtBytes(c.mem)}` : ""}
        {c.cpuPct != null ? ` · ${c.cpuPct.toFixed(1)}% cpu` : ""}
        {c.restarts ? ` · ${c.restarts} restart${c.restarts === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}

function DeployCell({ r, now }: { r: ProjectRow; now: number }) {
  const d = r.latest;
  if (!d) return <span className="text-muted">no data</span>;
  const t = deployTone(d);
  return (
    <div className="space-y-1">
      <Badge tone={t.tone} dot>{t.label}</Badge>
      <p className="max-w-[260px] truncate text-xs text-muted" title={d.message}>
        <span className="font-mono">{d.commit.slice(0, 7)}</span> {d.message || "–"}
      </p>
      <p className="text-xs tabular-nums text-muted">{ago(d.createdAt, now)}{isActiveDeployment(d) ? "" : ` · took ${duration(d.createdAt, d.finishedAt)}`}</p>
    </div>
  );
}

function SiteCell({ r }: { r: ProjectRow }) {
  if (!r.probe) return <span className="text-muted">no data</span>;
  const bad = r.probe.status === 0 || r.probe.status >= 500;
  return (
    <div className="space-y-1">
      <Badge tone={bad ? "bad" : r.probe.ms > 5000 ? "warn" : "good"} dot>{r.probe.status === 0 ? "no answer" : r.probe.status}</Badge>
      <p className="text-xs tabular-nums text-muted">{r.probe.ms < 1000 ? `${r.probe.ms} ms` : `${(r.probe.ms / 1000).toFixed(1)} s`}</p>
    </div>
  );
}

export function ServersView({ d }: { d: ServersData }) {
  const bad = d.servers.filter((s) => s.health.level !== "good").length + d.projects.filter((p) => p.level === "bad").length;
  const building = d.projects.filter((p) => p.deploying).length;
  const failed = d.projects.filter((p) => p.reasons.some((x) => x.startsWith("last build failed"))).length;
  return (
    <div className="space-y-8">
      <AutoRefresh seconds={30} />
      <div>
        <PageHeader title="Servers & deployments" description="How both servers are doing, whether each project is running and answering, and what was deployed last. Updates itself every 30 seconds." />
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Servers" value={`${d.servers.filter((s) => s.health.level === "good").length} / ${d.servers.length}`} icon={<Server className="h-4 w-4" />} tone={d.servers.every((s) => s.health.level === "good") ? "good" : "warn"} sub="healthy" />
          <Stat label="Projects up" value={`${d.projects.filter((p) => p.level !== "bad").length} / ${d.projects.length}`} icon={<CheckCircle2 className="h-4 w-4" />} tone={d.projects.every((p) => p.level !== "bad") ? "good" : "bad"} sub={bad ? "something needs attention" : "all running"} />
          <Stat label="Building now" value={building} icon={<Rocket className="h-4 w-4" />} tone={building ? "info" : "muted"} sub={building ? "a deploy is in progress" : "no deploys running"} />
          <Stat label="Failed builds" value={failed} icon={<TriangleAlert className="h-4 w-4" />} tone={failed ? "warn" : "muted"} sub={failed ? "the old version keeps running" : "last builds all fine"} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {d.servers.map((s) => <ServerCard key={s.name} s={s} now={d.now} />)}
        </div>
      </div>

      <section>
        <SectionTitle hint="Container and direct site check come from the server that runs it; the latest deployment comes from Coolify.">Projects</SectionTitle>
        <Card pad={false} className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-3">Project</th>
                <th scope="col" className="px-3 py-3">Container</th>
                <th scope="col" className="px-3 py-3">Site (direct)</th>
                <th scope="col" className="px-3 py-3">Latest deployment</th>
              </tr>
            </thead>
            <tbody className="c-divide">
              {d.projects.map((r) => (
                <tr key={r.name} className="align-top">
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-2 font-semibold">{r.name}{r.deploying && <Badge tone="info">deploying</Badge>}</p>
                    <p className="text-xs text-muted">{r.server ?? "server unknown"}{r.url && <> · <a className="hover:underline" href={r.url} target="_blank" rel="noreferrer noopener">{r.url.replace(/^https?:\/\//, "")}</a></>}</p>
                    {r.level !== "good" && <p className={`mt-1 text-xs ${r.level === "bad" ? "text-bad" : "text-warn"}`}>{r.reasons.join(" · ")}</p>}
                  </td>
                  <td className="px-3 py-3"><ContainerCell c={r.container} /></td>
                  <td className="px-3 py-3"><SiteCell r={r} /></td>
                  <td className="px-3 py-3"><DeployCell r={r} now={d.now} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionTitle hint="The newest deployments across every project.">Recent deployments</SectionTitle>
        {d.deployments.length ? (
          <Card pad={false}>
            <ul className="c-divide">
              {d.deployments.map((x) => {
                const t = deployTone(x);
                return (
                  <li key={x.project + x.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{x.project} <span className="font-mono text-xs font-normal text-muted">{x.commit.slice(0, 7)}</span></p>
                      <p className="max-w-[60ch] truncate text-xs text-muted" title={x.message}>{x.message || "–"}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums text-muted">
                      <span>{ago(x.createdAt, d.now)}{isActiveDeployment(x) ? "" : ` · ${duration(x.createdAt, x.finishedAt)}`}</span>
                      <Badge tone={t.tone} dot>{t.label}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Empty title="No deployments reported" hint="Deployments come from the Coolify server's agent." icon={<Rocket className="h-5 w-5" />} />
        )}
      </section>

      <section>
        <SectionTitle hint="Everything docker runs on each server, including Coolify's own parts.">All containers</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {d.servers.map((s) => (
            <details key={s.name} className="c-card" open={false}>
              <summary className="c-tap cursor-pointer px-4 py-3 text-sm font-semibold">{s.name} <span className="font-normal text-muted">· {s.snap?.containers.length ?? 0} containers</span></summary>
              <ul className="c-divide border-t border-line">
                {(s.snap?.containers ?? []).map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                    <span className="min-w-0 truncate font-mono">{c.name}</span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted">
                      {c.mem != null && fmtBytes(c.mem)}
                      <Badge tone={c.state === "running" && c.health !== "unhealthy" ? "good" : "bad"}>{c.state}{c.health ? ` · ${c.health}` : ""}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
