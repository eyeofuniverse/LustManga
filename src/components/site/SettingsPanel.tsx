"use client";

import { useEffect, useState } from "react";
import { Check, Download, EyeOff, Moon, Plus, Search, Sun, Trash2, Upload, X } from "lucide-react";
import { usePrefs } from "./PrefsProvider";
import { MAX_HIDDEN } from "@/lib/prefs";
import { LANGUAGES } from "@/lib/format";
import { DEFAULT_READER, applyBackup, buildBackup, parseBackup, useFavorites, useHistory, useReaderPrefs } from "@/lib/library";
import type { SuggestResult } from "@/lib/types";

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Export the library to a file and bring one back: the way to move between browsers and devices without an account. */
function BackupCard() {
  const { prefs, replaceAll } = usePrefs();
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(buildBackup({ langs: prefs.langs, hide: prefs.hide }), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lustmanga-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setNote({ ok: true, text: "Backup saved. Keep the file somewhere safe." });
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const b = parseBackup(await file.text());
    if (!b) return setNote({ ok: false, text: "That file is not a LustManga backup." });
    if (mode === "replace" && !window.confirm("Replace your saved works, history and settings with this backup?")) return;
    applyBackup(b, mode);
    if (mode === "replace" || b.prefs.langs.length || b.prefs.hide.length) {
      replaceAll(mode === "replace" ? b.prefs : { langs: [...new Set([...prefs.langs, ...b.prefs.langs])], hide: [...prefs.hide, ...b.prefs.hide.filter((h) => !prefs.hide.some((x) => x.id === h.id))] });
    }
    setNote({ ok: true, text: `Restored ${b.fav.length} saved, ${b.history.length} in history, ${b.follow.length} followed.` });
  };

  return (
    <Card title="Backup and restore" hint="No account needed: save your library to a file, and load it in any other browser or device.">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={exportFile} className="btn-soft">
          <Download className="h-4 w-4" /> Download backup
        </button>
        <label className="btn-soft cursor-pointer">
          <Upload className="h-4 w-4" /> Restore from file
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-2 p-1 sm:max-w-sm" role="radiogroup" aria-label="When restoring">
        {([["merge", "Add to what I have"], ["replace", "Replace everything"]] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={`h-10 rounded-lg px-3 text-sm font-semibold transition ${mode === v ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}>
            {l}
          </button>
        ))}
      </div>
      {note && (
        <p role="status" className={`text-sm ${note.ok ? "text-good" : "text-red-400"}`}>
          {note.text}
        </p>
      )}
    </Card>
  );
}

export function SettingsPanel() {
  const { prefs, toggleLang, setLangs, hideTag, unhideTag, replaceAll } = usePrefs();
  const { prefs: reader, set: setReader } = useReaderPrefs();
  const fav = useFavorites();
  const hist = useHistory();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SuggestResult["tags"]>([]);

  useEffect(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"), []);

  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: SuggestResult) => setFound(d.tags.filter((t) => t.type === "TAG").slice(0, 6)))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const chooseTheme = (t: "dark" | "light") => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("lm:theme", t);
    } catch {
      /* not persisted in private mode */
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Languages" hint="Only show works in these languages. Leave all off to see everything.">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => {
            const on = prefs.langs.includes(l.code);
            return (
              <button key={l.code} type="button" aria-pressed={on} onClick={() => toggleLang(l.code)} className={`chip min-h-[40px] px-3.5 ${on ? "chip-active" : ""}`}>
                {on && <Check className="h-3.5 w-3.5" />}
                {l.label}
              </button>
            );
          })}
        </div>
        {prefs.langs.length > 0 && (
          <button type="button" onClick={() => setLangs([])} className="btn-ghost h-10 !min-h-0 px-3 text-sm">
            Show every language
          </button>
        )}
      </Card>

      <Card title="Hidden tags" hint="Works with these tags never appear in lists, search or suggestions.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tag to hide" aria-label="Find a tag to hide" className="h-12 w-full rounded-xl border border-line bg-surface-2/70 pl-10 pr-3 text-sm placeholder:text-muted/80 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30" />
        </div>
        {prefs.hide.length >= MAX_HIDDEN && <p className="text-sm text-warn">You can hide up to {MAX_HIDDEN} tags. Unhide one to add another.</p>}
        {found.length > 0 && prefs.hide.length < MAX_HIDDEN && (
          <ul className="flex flex-wrap gap-2" aria-label="Matching tags">
            {found.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => { hideTag({ id: t.id, name: t.name }); setQ(""); setFound([]); }} className="chip min-h-[40px] px-3.5">
                  <Plus className="h-3.5 w-3.5" /> {t.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {prefs.hide.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Hidden tags">
            {prefs.hide.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => unhideTag(t.id)} className="chip chip-active min-h-[40px] px-3.5" aria-label={`Unhide ${t.name}`}>
                  <EyeOff className="h-3.5 w-3.5" /> {t.name} <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No hidden tags.</p>
        )}
      </Card>

      <Card title="Appearance">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Theme">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => chooseTheme(t)} className={`flex h-14 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition ${theme === t ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface-2 text-muted hover:text-text"}`}>
              {t === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              {t === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Reader" hint="Defaults for the reader. You can also change these while reading.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-semibold">
            Mode
            <select value={reader.mode} onChange={(e) => setReader({ mode: e.target.value as "auto" | "book" | "scroll" })} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm font-normal">
              <option value="auto">Auto (book, scroll for webtoons)</option>
              <option value="book">Book: swipe to turn pages</option>
              <option value="scroll">Continuous scroll</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-semibold">
            Book direction
            <select value={reader.rtl ? "rtl" : "ltr"} onChange={(e) => setReader({ rtl: e.target.value === "rtl" })} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm font-normal">
              <option value="ltr">Left to right</option>
              <option value="rtl">Right to left (manga)</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-semibold">
            Two-page spreads
            <select value={reader.spread} onChange={(e) => setReader({ spread: e.target.value as "auto" | "off" })} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm font-normal">
              <option value="auto">On wide screens</option>
              <option value="off">Off</option>
            </select>
          </label>
        </div>
        <button type="button" onClick={() => setReader(DEFAULT_READER)} className="btn-ghost h-10 !min-h-0 px-3 text-sm">
          Reset reader to defaults
        </button>
      </Card>

      <BackupCard />

      <Card title="Your data" hint="Saved works and reading history stay on this device only.">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!fav.ids.length} onClick={() => window.confirm("Remove all saved works?") && fav.clear()} className="btn-soft">
            <Trash2 className="h-4 w-4" /> Clear saved ({fav.ids.length})
          </button>
          <button type="button" disabled={!hist.items.length} onClick={() => window.confirm("Clear reading history?") && hist.clear()} className="btn-soft">
            <Trash2 className="h-4 w-4" /> Clear history ({hist.items.length})
          </button>
        </div>
      </Card>
    </div>
  );
}
