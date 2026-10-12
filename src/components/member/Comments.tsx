"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Flag, Loader2, MessageSquare, Pencil, Reply, Trash2 } from "lucide-react";
import { deleteCommentAction, editCommentAction, moreCommentsAction, postCommentAction, reportCommentAction, voteCommentAction } from "@/lib/member/actions";
import type { CommentDto, CommentSort } from "@/lib/member/community-queries";
import { COMMENT_MAX, REPORT_REASONS } from "@/lib/member/constants";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./Avatar";

/**
 * A work's comment thread: the composer, the comments (newest or top), replies one level deep, votes, edit, delete and
 * report. The first page arrives with the page (so the text is in the HTML); everything else runs through server actions,
 * and every rule is enforced there, not here.
 */
type Me = { handle: string; displayName: string; banned: boolean } | null;
const FIELD = "w-full rounded-xl border border-line bg-surface-2/70 px-3.5 py-2.5 text-sm placeholder:text-muted/70 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30";

function Composer({ work, parentId, me, placeholder, initial = "", onDone, onCancel, edit }: { work: number; parentId?: string; me: Me; placeholder: string; initial?: string; onDone: () => void; onCancel?: () => void; edit?: string }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!me) return null;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = edit ? await editCommentAction({ id: edit, body: text }) : await postCommentAction({ work, body: text, parentId });
      if (!r.ok) return setError(r.message);
      setText("");
      onDone();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-2" aria-busy={pending}>
      <label className="sr-only" htmlFor={`c-${parentId ?? edit ?? "new"}`}>
        {placeholder}
      </label>
      <textarea id={`c-${parentId ?? edit ?? "new"}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} rows={parentId || edit ? 3 : 4} maxLength={COMMENT_MAX + 200} className={FIELD} disabled={me.banned} />
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary h-10 px-5 text-sm" disabled={pending || me.banned || text.trim().length < 2}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {edit ? "Save" : parentId ? "Reply" : "Post comment"}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost h-10 px-4 text-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className={`ml-auto text-xs tabular-nums ${text.length > COMMENT_MAX ? "text-bad" : "text-muted"}`}>
          {text.length}/{COMMENT_MAX}
        </span>
      </div>
    </form>
  );
}

function ReportBox({ id, onClose }: { id: string; onClose: () => void }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (msg === "ok")
    return (
      <p role="status" className="text-xs text-muted">
        Thanks. A moderator will look at it.
      </p>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await reportCommentAction({ id, reason });
          if (r.ok) setMsg("ok");
          else setMsg(r.message);
        });
      }}
    >
      <label className="sr-only" htmlFor={`rp-${id}`}>
        Reason
      </label>
      <select id={`rp-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-line bg-surface-2 px-2 py-1.5">
        {REPORT_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <button className="btn-soft h-8 px-3 text-xs" disabled={pending}>
        Send report
      </button>
      <button type="button" className="text-muted underline" onClick={onClose}>
        Cancel
      </button>
      {msg && msg !== "ok" && (
        <span role="alert" className="basis-full text-bad">
          {msg}
        </span>
      )}
    </form>
  );
}

function Item({ c, work, me, onChanged, depth }: { c: CommentDto; work: number; me: Me; onChanged: () => void; depth: 0 | 1 }) {
  const [score, setScore] = useState(c.score);
  const [vote, setVote] = useState(c.myVote);
  const [mode, setMode] = useState<"" | "reply" | "edit" | "report">("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const gone = c.status === "REMOVED" || (!c.body && c.status !== "VISIBLE");
  const own = c.mine;

  const castVote = (v: 1 | -1) => {
    setErr("");
    const next = vote === v ? 0 : v;
    const before = { score, vote };
    setScore(score - vote + next);
    setVote(next);
    start(async () => {
      const r = await voteCommentAction({ id: c.id, value: next });
      if (!r.ok) {
        setScore(before.score);
        setVote(before.vote);
        setErr(r.message);
      } else {
        setScore(r.score);
      }
    });
  };

  return (
    <li id={`comment-${c.id}`} className={depth ? "pt-4" : "py-5"}>
      <div className="flex gap-3">
        {c.author ? <Avatar name={c.author.displayName} handle={c.author.handle} size={depth ? 30 : 38} /> : <span className="h-[38px] w-[38px] shrink-0 rounded-full bg-surface-2" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            {c.author ? (
              <Link href={`/u/${c.author.handle}`} rel="nofollow ugc" className="font-semibold hover:text-accent">
                {c.author.displayName}
              </Link>
            ) : (
              <span className="font-semibold text-muted">[deleted]</span>
            )}
            <time className="text-xs text-muted" dateTime={c.createdAt}>
              {timeAgo(c.createdAt)}
            </time>
            {c.edited && !gone && <span className="text-xs text-muted">(edited)</span>}
            {c.status === "HIDDEN" && own && <span className="rounded bg-warn/20 px-1.5 py-0.5 text-xs font-semibold text-warn">hidden pending review</span>}
          </p>
          {mode === "edit" ? (
            <div className="mt-2">
              <Composer work={work} me={me} edit={c.id} initial={c.body} placeholder="Edit your comment" onCancel={() => setMode("")} onDone={() => { setMode(""); onChanged(); }} />
            </div>
          ) : gone || !c.body ? (
            <p className="mt-1 text-sm italic text-muted">{c.status === "HIDDEN" ? "[comment hidden]" : "[deleted]"}</p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-text/90">{c.body}</p>
          )}
          {!gone && c.body && mode !== "edit" && (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
              <button type="button" onClick={() => castVote(1)} disabled={!me || own || pending} aria-pressed={vote === 1} aria-label="Up-vote" className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-40 ${vote === 1 ? "text-accent" : ""}`}>
                <ChevronUp className="h-5 w-5" />
              </button>
              <span className="min-w-[1.5ch] text-center font-semibold tabular-nums" aria-label={`Score ${score}`}>
                {score}
              </span>
              <button type="button" onClick={() => castVote(-1)} disabled={!me || own || pending} aria-pressed={vote === -1} aria-label="Down-vote" className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-40 ${vote === -1 ? "text-accent" : ""}`}>
                <ChevronDown className="h-5 w-5" />
              </button>
              {me && c.status === "VISIBLE" && (
                <button type="button" onClick={() => setMode(mode === "reply" ? "" : "reply")} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-surface-2 hover:text-text">
                  <Reply className="h-3.5 w-3.5" /> Reply
                </button>
              )}
              {own && c.status === "VISIBLE" && (
                <button type="button" onClick={() => setMode("edit")} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-surface-2 hover:text-text">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              {own && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("Delete this comment?")) return;
                    start(async () => {
                      const r = await deleteCommentAction({ id: c.id });
                      if (!r.ok) setErr(r.message);
                      else onChanged();
                    });
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-surface-2 hover:text-bad"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
              {me && !own && (
                <button type="button" onClick={() => setMode(mode === "report" ? "" : "report")} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-surface-2 hover:text-text">
                  <Flag className="h-3.5 w-3.5" /> Report
                </button>
              )}
            </div>
          )}
          {err && (
            <p role="alert" className="mt-1 text-xs text-bad">
              {err}
            </p>
          )}
          {mode === "report" && (
            <div className="mt-2">
              <ReportBox id={c.id} onClose={() => setMode("")} />
            </div>
          )}
          {mode === "reply" && (
            <div className="mt-3">
              <Composer work={work} me={me} parentId={c.id} placeholder={`Reply to ${c.author?.displayName ?? "this comment"}`} onCancel={() => setMode("")} onDone={() => { setMode(""); onChanged(); }} />
            </div>
          )}
          {c.replies.length > 0 && (
            <ul className="mt-2 space-y-0 border-l border-line pl-4 sm:pl-5" aria-label="Replies">
              {c.replies.map((r) => (
                <Item key={r.id} c={r} work={work} me={me} onChanged={onChanged} depth={1} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function Comments({ work, initial, total, topLevel, me, next }: { work: number; initial: CommentDto[]; total: number; topLevel: number; me: Me; next: string }) {
  const [items, setItems] = useState(initial);
  const [count, setCount] = useState(total);
  const [tops, setTops] = useState(topLevel);
  const [sort, setSort] = useState<CommentSort>("new");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const reload = (s: CommentSort = sort) =>
    start(async () => {
      const r = await moreCommentsAction({ work, sort: s, page: 1 });
      if (!r.ok) return setError(r.message);
      setItems(r.items);
      setTops(r.topLevel);
      setPage(1);
      setSort(s);
      setCount((c) => Math.max(c, r.items.length));
    });
  const more = () =>
    start(async () => {
      const r = await moreCommentsAction({ work, sort, page: page + 1 });
      if (!r.ok) return setError(r.message);
      setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setPage(page + 1);
    });

  return (
    <section aria-labelledby="comments-title" className="pt-14">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="comments-title" className="section-title inline-flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-accent" aria-hidden="true" /> Comments <span className="text-base font-semibold text-muted">{count.toLocaleString("en-US")}</span>
        </h2>
        {tops > 1 && (
          <div className="flex rounded-xl border border-line p-0.5 text-sm" role="group" aria-label="Sort comments">
            {(["new", "top"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={sort === s} onClick={() => sort !== s && reload(s)} className={`rounded-lg px-3.5 py-1.5 font-semibold transition ${sort === s ? "bg-accent text-white" : "text-muted hover:text-text"}`}>
                {s === "new" ? "Newest" : "Top"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-2 p-4 sm:p-5">
        {me ? (
          <>
            <p className="mb-3 text-sm text-muted">
              Commenting as <Link href={`/u/${me.handle}`} className="font-semibold text-text hover:text-accent">{me.displayName}</Link>. Be kind, stay on topic, no links, and nothing involving minors.
            </p>
            {me.banned ? <p className="text-sm text-bad">This account cannot post comments.</p> : <Composer work={work} me={me} placeholder="Share what you thought of it" onDone={() => reload()} />}
          </>
        ) : (
          <p className="text-sm text-muted">
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-accent underline underline-offset-2">Sign in</Link> or{" "}
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-accent underline underline-offset-2">create a free account</Link> to join the conversation.
          </p>
        )}
      </div>

      {items.length ? (
        <ul className="divide-y divide-line" aria-busy={pending}>
          {items.map((c) => (
            <Item key={c.id} c={c} work={work} me={me} depth={0} onChanged={() => reload()} />
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted">No comments yet. Be the first to say something.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
      {items.length < tops && (
        <div className="mt-4 text-center">
          <button className="btn-soft h-11 px-8" onClick={more} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Show more comments
          </button>
        </div>
      )}
    </section>
  );
}
