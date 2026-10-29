import "server-only";
import { notFound } from "next/navigation";
import { guardConsole } from "@/lib/admin/guard";
import { hasRole } from "@/lib/admin/auth";
import { issueCount, projectRows, recentDeployments, serverHealth, SERVERS, type HistoryPoint, type ProjectRow, type ServerHealth, type ServerName, type Snapshot } from "@/lib/admin/vps";
import { readHistory, readLatest } from "@/lib/admin/vps-store";

export interface ServersData {
  now: number;
  servers: { name: ServerName; hosts: string; snap: Snapshot | null; health: ServerHealth; history: HistoryPoint[] }[];
  projects: ProjectRow[];
  deployments: ReturnType<typeof recentDeployments>;
}

/** Server and deployment health is infrastructure, so like the ads screens it is for an admin or the owner, and checked here next to the data. */
export async function loadServers(): Promise<ServersData> {
  const me = await guardConsole();
  if (!hasRole(me, "ADMIN")) notFound();
  const [latest, history] = await Promise.all([readLatest(), readHistory()]);
  const now = Date.now();
  const projects = projectRows(latest);
  return {
    now,
    servers: SERVERS.map((x) => ({ name: x.name, hosts: x.hosts, snap: latest[x.name], health: serverHealth(latest[x.name], now), history: history[x.name] })),
    projects,
    deployments: recentDeployments(projects, 15),
  };
}

/** For the nav badge in the panel layout: how many servers or projects need a look (0 for a moderator, who never sees the screen). */
export async function serverIssueCount(): Promise<number> {
  return issueCount(await readLatest());
}
