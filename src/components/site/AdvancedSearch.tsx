"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { buildQuery, emptyForm, formFromQuery, type Field, type SearchForm } from "@/lib/search";
import type { SuggestResult } from "@/lib/types";
import { withQuery } from "@/lib/url";

const FIELD_OF: Record<string, Field> = { TAG: "tag", ARTIST: "artist", GROUP: "group", PARODY: "parody", CHARACTER: "character" };
const WITHIN: [string, number | undefined][] = [["Any time", undefined], ["Last day", 1], ["Last week", 7], ["Last month", 30], ["Last 3 months", 90], ["Last year", 365]];

type Picked = { field: Field; value: string };

/**
 * A form for the search syntax: add tags, artists, parodies and characters to include or exclude (with suggestions as
 * you type), set a page range and how recently it was added. It builds the same ?q= the text box accepts, so every
 * result is a normal shareable search URL.
 */
export function AdvancedSearch({ initialQ, params }: { initialQ: string; params: Record<string, string | undefined> }) {
  const router = useRouter();
  const id = useId();
  const initial = useMemo(() => formFromQuery(initialQ), [initialQ]);
  const advanced = initial.include.length + initial.exclude.length > 0 || initial.pagesMin !== undefined || initial.pagesMax !== undefined || initial.withinDays !== undefined;
  const [open, setOpen] = useState(advanced);
  const [form, setForm] = useState<SearchForm>(initial);
  const [mode, setMode] = useState<"include" | "exclude">("include");
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<SuggestResult["tags"]>([]);

  useEffect(() => setForm(initial), [initial]);

  useEffect(() => {
    if (term.trim().length < 2) return setFound([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(term.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<SuggestResult>)
        .then((d) => setFound(d.tags.filter((x) => FIELD_OF[x.type]).slice(0, 6)))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  const add = (p: Picked) => {
    setForm((f) => {
      const same = (x: Picked) => x.field === p.field && x.value.toLowerCase() === p.value.toLowerCase();
      const inc = f.include.filter((x) => !same(x));
      const exc = f.exclude.filter((x) => !same(x));
      return mode === "include" ? { ...f, include: [...inc, p], exclude: exc } : { ...f, include: inc, exclude: [...exc, p] };
    });
    setTerm("");
    setFound([]);
  };
  const remove = (list: "include" | "exclude", p: Picked) => setForm((f) => ({ ...f, [list]: f[list].filter((x) => !(x.field === p.field && x.value === p.value)) }));

  const num = (v: string) => (v === "" ? undefined : Math.min(100_000, Math.max(0, Number.parseInt(v, 10) || 0)) || undefined);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = buildQuery(form);
    router.push(withQuery("/search", params, { q: q || undefined, page: undefined }));
  };

  const chip = (list: "include" | "exclude", p: Picked) => (
    <li key={`${list}${p.field}${p.value}`} className={`chip !gap-0 !p-0 ${list === "include" ? "chip-active" : "!bg-red-500/15 !text-red-300"}`}>
      <span className="px-3 py-1.5">
        {list === "exclude" && <span className="sr-only">Not </span>}
        {p.field !== "tag" && <span className="mr-1 text-[11px] uppercase opacity-70">{p.field}</span>}
        {p.value}
      </span>
      <button type="button" onClick={() => remove(list, p)} aria-label={`Remove ${p.value}`} className="grid h-8 w-8 place-items-center rounded-r-lg hover:bg-black/20">
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );

  const field = "h-11 rounded-xl border border-line bg-surface-2/70 px-3 text-sm focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30";
  return (
    <section aria-label="Advanced search" className="mb-6">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${id}-panel`} className="btn-soft h-11 !min-h-0 px-4 text-sm">
        <SlidersHorizontal className="h-4 w-4" /> {open ? "Hide advanced filters" : "Advanced filters"}
      </button>
      {open && (
        <form id={`${id}-panel`} onSubmit={submit} className="card mt-3 space-y-5 p-4 sm:p-5">
          <div className="space-y-2">
            <label htmlFor={`${id}-words`} className="text-sm font-semibold">
              Words in the title
            </label>
            <input id={`${id}-words`} value={form.words} onChange={(e) => setForm({ ...form, words: e.target.value })} placeholder="school life" className={`${field} w-full`} />
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">Tags, artists, parodies, characters</span>
              <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Add as">
                {(["include", "exclude"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`h-9 rounded-lg px-3 text-sm font-semibold transition ${mode === m ? (m === "include" ? "bg-accent-fill text-white" : "bg-red-600 text-white") : "text-muted hover:text-text"}`}>
                    {m === "include" ? "Must have" : "Must not have"}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && term.trim()) { e.preventDefault(); add(found[0] ? { field: FIELD_OF[found[0].type], value: found[0].name } : { field: "tag", value: term.trim() }); } }} placeholder="Type to find a tag, artist or parody" aria-label="Find a tag, artist, parody or character" className={`${field} w-full`} />
              {found.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-card" aria-label="Matches">
                  {found.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => add({ field: FIELD_OF[t.type], value: t.name })} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                        <span className="flex items-center gap-2">
                          <Plus className="h-3.5 w-3.5" /> {t.name}
                        </span>
                        <span className="text-xs capitalize text-muted">{t.type.toLowerCase()} · {t.count.toLocaleString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {(form.include.length > 0 || form.exclude.length > 0) && (
              <ul className="flex flex-wrap gap-2" aria-label="Chosen">
                {form.include.map((p) => chip("include", p))}
                {form.exclude.map((p) => chip("exclude", p))}
              </ul>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Pages</legend>
              <div className="flex items-center gap-2">
                <input inputMode="numeric" aria-label="Minimum pages" placeholder="Min" value={form.pagesMin ?? ""} onChange={(e) => setForm({ ...form, pagesMin: num(e.target.value) })} className={`${field} w-24 text-center`} />
                <span className="text-muted" aria-hidden="true">to</span>
                <input inputMode="numeric" aria-label="Maximum pages" placeholder="Max" value={form.pagesMax ?? ""} onChange={(e) => setForm({ ...form, pagesMax: num(e.target.value) })} className={`${field} w-24 text-center`} />
              </div>
            </fieldset>
            <div className="space-y-2">
              <label htmlFor={`${id}-within`} className="text-sm font-semibold">
                Added
              </label>
              <select id={`${id}-within`} value={form.withinDays ?? ""} onChange={(e) => setForm({ ...form, withinDays: e.target.value ? Number(e.target.value) : undefined })} className={`${field} w-full`}>
                {WITHIN.map(([label, days]) => (
                  <option key={label} value={days ?? ""}>
                    {label}
                  </option>
                ))}
                {form.withinDays !== undefined && !WITHIN.some(([, d]) => d === form.withinDays) && <option value={form.withinDays}>Last {form.withinDays} days</option>}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn-primary h-11 px-6">
              Search with these filters
            </button>
            <button type="button" onClick={() => setForm(emptyForm())} className="btn-ghost h-11">
              Clear filters
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
