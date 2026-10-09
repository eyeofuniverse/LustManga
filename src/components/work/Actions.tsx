"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, Bell, BellRing, Check, EyeOff, Flag, Heart, Link2, Play, Share2 } from "lucide-react";
import { MAX_FOLLOWS, resumePoint, useFavorites, useFollows, useHistory } from "@/lib/library";
import { compact, readHref } from "@/lib/format";
import { usePrefs } from "@/components/site/PrefsProvider";

/** Start reading, or pick up where the visitor left off (the next chapter if they finished one, the beginning if they finished it all). */
export function ReadButton({ publicId, chapters, className = "" }: { publicId: number; chapters: number[]; className?: string }) {
  const { byId } = useHistory();
  const r = resumePoint(byId(publicId), chapters);
  const label = { start: "Start reading", continue: r.page ? `Continue (page ${r.page})` : `Continue (chapter ${r.ch})`, next: `Next: chapter ${r.ch}`, again: "Read again" }[r.kind];
  return (
    <Link href={readHref(publicId, r.ch, r.page)} className={`btn-primary h-12 flex-1 sm:flex-none sm:px-8 ${className}`}>
      {r.kind === "start" || r.kind === "again" ? <BookOpen className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
      {label}
    </Link>
  );
}

/** Save / un-save. `count` is how many visitors have saved the work (from the server); this browser's own change is added on top. */
export function FavoriteButton({ publicId, compact: small = false, count }: { publicId: number; compact?: boolean; count?: number }) {
  const { has, toggle } = useFavorites();
  // the server cannot know the saved state, so render "not saved" until mounted to avoid a hydration mismatch
  const [mounted, setMounted] = useState(false);
  const wasOn = useRef(false);
  useEffect(() => {
    wasOn.current = has(publicId);
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const on = mounted && has(publicId);
  const shown = count == null ? null : Math.max(0, count + (on ? 1 : 0) - (wasOn.current ? 1 : 0));
  const click = () => {
    const next = !on;
    toggle(publicId);
    // the public counter; the visitor's own library never leaves the browser
    fetch("/api/favorite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: publicId, on: next }), keepalive: true }).catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={on}
      aria-label={`${on ? "Remove from saved" : "Save to your library"}${shown ? ` (${shown} saved)` : ""}`}
      className={`${small ? "btn-icon bg-surface-2" : "btn-soft h-12"} ${on ? "!text-accent" : ""}`}
    >
      <Heart className={`h-5 w-5 transition ${on ? "scale-110 fill-current" : ""}`} />
      {!small && (on ? "Saved" : "Save")}
      {!small && shown ? <span className="text-xs font-normal text-muted">{compact(shown)}</span> : null}
    </button>
  );
}

export function ShareButton({ title, compact = false }: { title: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => setNative("share" in navigator), []);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* the share sheet was dismissed */
    }
  };
  return (
    <button type="button" onClick={share} className={compact ? "btn-icon bg-surface-2" : "btn-soft h-12"} aria-label="Share">
      {done ? <Check className="h-5 w-5 text-good" /> : native ? <Share2 className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
      {!compact && (done ? "Link copied" : "Share")}
    </button>
  );
}

export function ReportLink({ publicId }: { publicId: number }) {
  return (
    <Link href={`/report-content?work=${publicId}`} className="btn-ghost h-12" aria-label="Report this work">
      <Flag className="h-5 w-5" />
      <span className="hidden sm:inline">Report</span>
    </Link>
  );
}

/** Follow a tag, artist, circle, parody or character: its new works appear on the Following page. */
export function FollowButton({ id, type, slug, name }: { id: number; type: string; slug: string; name: string }) {
  const { has, toggle, items } = useFollows();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const on = mounted && has(id);
  const full = !on && items.length >= MAX_FOLLOWS;
  return (
    <button type="button" onClick={() => toggle({ id, type, slug, name })} disabled={full} aria-pressed={on} className={`btn-soft h-11 ${on ? "!text-accent" : "text-muted"}`} title={full ? `You can follow up to ${MAX_FOLLOWS}` : undefined}>
      {on ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {on ? "Following" : "Follow"}
    </button>
  );
}

export function HideTagButton({ id, name }: { id: number; name: string }) {
  const { prefs, hideTag, unhideTag } = usePrefs();
  const hidden = prefs.hide.some((h) => h.id === id);
  return (
    <button type="button" onClick={() => (hidden ? unhideTag(id) : hideTag({ id, name }))} className="btn-soft h-11 text-muted">
      <EyeOff className="h-4 w-4" />
      {hidden ? "Unhide this tag" : "Never show this tag"}
    </button>
  );
}

/** Counts a view once per mount; the server dedupes per visitor. */
export function ViewPing({ publicId }: { publicId: number }) {
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: publicId }), keepalive: true }).catch(() => {});
    }, 3000); // a bounce in the first seconds is not a view
    return () => clearTimeout(t);
  }, [publicId]);
  return null;
}
