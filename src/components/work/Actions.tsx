"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Check, EyeOff, Flag, Heart, Link2, Play, Share2 } from "lucide-react";
import { useFavorites, useHistory } from "@/lib/library";
import { readHref } from "@/lib/format";
import { usePrefs } from "@/components/site/PrefsProvider";

/** Start reading, or pick up exactly where the visitor left off. */
export function ReadButton({ publicId, firstChapter, className = "" }: { publicId: number; firstChapter: number; className?: string }) {
  const { byId } = useHistory();
  const h = byId(publicId);
  const resume = h && h.page > 1 ? h : null;
  return (
    <Link href={resume ? readHref(publicId, resume.ch, resume.page) : readHref(publicId, firstChapter)} className={`btn-primary h-12 flex-1 sm:flex-none sm:px-8 ${className}`}>
      {resume ? <Play className="h-5 w-5 fill-current" /> : <BookOpen className="h-5 w-5" />}
      {resume ? `Continue (page ${resume.page})` : "Start reading"}
    </Link>
  );
}

export function FavoriteButton({ publicId, compact = false }: { publicId: number; compact?: boolean }) {
  const { has, toggle } = useFavorites();
  // the server cannot know the saved state, so render "not saved" until mounted to avoid a hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const on = mounted && has(publicId);
  return (
    <button
      type="button"
      onClick={() => toggle(publicId)}
      aria-pressed={on}
      aria-label={on ? "Remove from saved" : "Save to your library"}
      className={`${compact ? "btn-icon bg-surface-2" : "btn-soft h-12"} ${on ? "!text-accent" : ""}`}
    >
      <Heart className={`h-5 w-5 transition ${on ? "scale-110 fill-current" : ""}`} />
      {!compact && (on ? "Saved" : "Save")}
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
