import Link from "next/link";
import { Ban, CheckCircle2, EyeOff, ExternalLink, MessagesSquare, ShieldCheck, Trash2, Undo2, UserX } from "lucide-react";
import { banMember, dismissCommentReports, setCommentStatus, unbanMember } from "@/lib/admin/community-actions";
import type { CommunityData } from "@/lib/admin/community";
import { ago, stamp } from "@/lib/admin/format";
import { workHref } from "@/lib/format";
import { ActionButton, ActionForm } from "../ActionForm";
import { Badge, Empty, PageHeader, Pager, Tabs, type Tone } from "../ui";

const REASON: Record<string, string> = { SPAM: "Spam", ABUSE: "Harassment / hate", MINORS: "Mentions minors", PRIVATE: "Private information", OTHER: "Other" };
const STATUS: Record<string, Tone> = { VISIBLE: "good", HIDDEN: "warn", REMOVED: "bad" };

export function CommunityView({ d }: { d: CommunityData }) {
  const base = (tab: string) => `/console/community?tab=${tab}`;
  const href = (n: number) => `/console/community?tab=${d.tab}${d.q ? `&q=${encodeURIComponent(d.q)}` : ""}&page=${n}`;
  return (
    <div>
      <PageHeader title="Community" description="Comments and members. A comment goes out of sight by itself when three different members report it; decide here whether it stays hidden." />
      <Tabs
        items={[
          { href: base("reported"), label: "Reported & hidden", count: d.counts.reported, active: d.tab === "reported" },
          { href: base("recent"), label: "All comments", active: d.tab === "recent" },
          { href: base("members"), label: "Members", count: d.counts.members, active: d.tab === "members" },
        ]}
      />
      {d.tab !== "reported" && (
        <form method="get" className="mb-5 flex gap-2">
          <input type="hidden" name="tab" value={d.tab} />
          <input name="q" defaultValue={d.q} placeholder={d.tab === "members" ? "Search username or email" : "Search comment text"} maxLength={60} className="c-input max-w-xs" aria-label="Search" />
          <button className="c-btn-ghost">Search</button>
        </form>
      )}

      {d.tab === "members" ? (
        d.members.length ? (
          <div className="c-card divide-y divide-line overflow-hidden">
            {d.members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <a href={`/u/${m.handle}`} target="_blank" rel="noreferrer noopener" className="hover:text-accent">{m.displayName}</a>
                    {m.banned && <Badge tone="bad">banned</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    Joined <time title={stamp(m.createdAt) + " UTC"}>{ago(m.createdAt)}</time>
                    {m.lastLoginAt ? ` · last in ${ago(m.lastLoginAt)}` : ""} · {m.comments} comment{m.comments === 1 ? "" : "s"} · {m.ratings} rating{m.ratings === 1 ? "" : "s"}
                    {m.email ? ` · ${m.email}` : ""}
                  </p>
                  {m.banned && m.bannedReason && <p className="text-xs text-bad">Reason: {m.bannedReason}</p>}
                </div>
                {d.canBan &&
                  (m.banned ? (
                    <ActionButton label="Unban" icon={<Undo2 className="h-3.5 w-3.5" />} action={unbanMember.bind(null, m.id)} />
                  ) : (
                    <ActionForm action={banMember} className="flex items-center gap-2" confirm={{ message: `Ban ${m.handle}? They keep reading, but cannot comment or rate, and their visible comments are hidden.`, confirmLabel: "Ban" }} danger>
                      <input type="hidden" name="id" value={m.id} />
                      <input name="reason" placeholder="Reason (shown to them)" maxLength={200} className="c-input w-48" aria-label={`Reason for banning ${m.handle}`} />
                      <button className="c-btn-ghost text-bad">
                        <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Ban
                      </button>
                    </ActionForm>
                  ))}
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={<UserX className="h-5 w-5" />} title="No members found" />
        )
      ) : d.comments.length ? (
        <div className="space-y-4">
          {d.comments.map((c) => (
            <article key={c.id} className="c-card overflow-hidden">
              <div className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={STATUS[c.status] ?? "muted"}>{c.status.toLowerCase()}</Badge>
                  {c.reports.length > 0 && <Badge tone="bad">{c.reports.length} open report{c.reports.length === 1 ? "" : "s"}</Badge>}
                  <span className="font-semibold text-text">{c.author ? c.author.displayName : "[deleted account]"}</span>
                  {c.author?.banned && <Badge tone="bad">author banned</Badge>}
                  <time className="text-muted" title={stamp(c.createdAt) + " UTC"}>{ago(c.createdAt)}</time>
                  <span className="text-muted">score {c.score}{c.replyCount ? ` · ${c.replyCount} repl${c.replyCount === 1 ? "y" : "ies"}` : ""}</span>
                  <a href={workHref(c.work)} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 text-muted hover:text-text">
                    {c.work.title.length > 40 ? c.work.title.slice(0, 40) + "…" : c.work.title} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
                <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{c.body || <em className="text-muted">(emptied)</em>}</p>
                {c.reports.length > 0 && (
                  <ul className="space-y-1 rounded-lg bg-surface-2/50 p-3 text-xs">
                    {c.reports.map((r, i) => (
                      <li key={i}>
                        <b>{REASON[r.reason] ?? r.reason}</b>
                        {r.details ? `: ${r.details}` : ""} <span className="text-muted">· {r.by ?? "deleted account"} · {ago(r.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/40 px-4 py-3 sm:px-5">
                {c.status !== "VISIBLE" && <ActionButton label="Restore" tone="good" icon={<CheckCircle2 className="h-3.5 w-3.5" />} action={setCommentStatus.bind(null, c.id, "VISIBLE")} />}
                {c.status === "VISIBLE" && <ActionButton label="Hide" icon={<EyeOff className="h-3.5 w-3.5" />} action={setCommentStatus.bind(null, c.id, "HIDDEN")} />}
                {c.status !== "REMOVED" && <ActionButton label="Remove" tone="bad" icon={<Trash2 className="h-3.5 w-3.5" />} confirm="Remove this comment for good? Its text stays in the audit trail but no longer shows anywhere." action={setCommentStatus.bind(null, c.id, "REMOVED")} />}
                {c.reports.length > 0 && <ActionButton label="Dismiss reports" icon={<ShieldCheck className="h-3.5 w-3.5" />} action={dismissCommentReports.bind(null, c.id)} />}
                {c.author && (
                  <Link href={`/console/community?tab=members&q=${encodeURIComponent(c.author.handle)}`} className="c-btn-ghost ml-auto">
                    Member
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={<MessagesSquare className="h-5 w-5" />} title={d.tab === "reported" ? "Nothing to look at" : "No comments yet"} hint={d.tab === "reported" ? "Reported and hidden comments show up here." : undefined} />
      )}
      <Pager page={d.page} pages={d.pages} href={href} />
    </div>
  );
}
