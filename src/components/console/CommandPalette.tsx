"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import type { NavItem } from "./Shell";

type Entry = { id: string; label: string; hint: string; href: string; external?: boolean };

/** Ctrl/Cmd+K: jump to any screen, open a work by number, or search works and tags, without leaving the keyboard. */
export function CommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: NavItem[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  const entries = useMemo<Entry[]>(() => {
    const term = q.trim();
    const pages: Entry[] = items
      .filter((i) => !term || i.label.toLowerCase().includes(term.toLowerCase()))
      .map((i) => ({ id: i.href, label: i.label, hint: i.group, href: i.href }));
    if (!term) return [...pages, { id: "site", label: "View the public site", hint: "Opens in a new tab", href: "/", external: true }];
    const found: Entry[] = [];
    if (/^#?\d+$/.test(term)) found.push({ id: "work-id", label: `Open work #${term.replace("#", "")}`, hint: "Works", href: `/console/works?q=${term.replace("#", "")}` });
    found.push({ id: "works", label: `Search works for “${term}”`, hint: "Works", href: `/console/works?q=${encodeURIComponent(term)}` });
    found.push({ id: "tags", label: `Search tags for “${term}”`, hint: "Tags & safety", href: `/console/tags?q=${encodeURIComponent(term)}` });
    return [...pages, ...found];
  }, [q, items]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setQ("");
      setCursor(0);
      d.showModal();
      requestAnimationFrame(() => input.current?.focus());
    }
    if (!open && d.open) d.close();
    if (!open) input.current?.blur();
  }, [open]);

  useEffect(() => setCursor(0), [q]);

  const go = (e: Entry) => {
    onClose();
    if (e.external) window.open(e.href, "_blank", "noopener");
    else router.push(e.href);
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label="Command palette"
      className="mx-auto mt-[12vh] w-[min(94vw,36rem)] rounded-2xl border border-line bg-surface p-0 text-text shadow-card backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setCursor((c) => Math.min(entries.length - 1, c + 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setCursor((c) => Math.max(0, c - 1)));
            else if (e.key === "Enter" && entries[cursor]) (e.preventDefault(), go(entries[cursor]));
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={entries[cursor] ? `pal-${entries[cursor].id}` : undefined}
          placeholder="Jump to a page, or search works and tags…"
          className="h-14 w-full bg-transparent text-[15px] text-text outline-none placeholder:text-muted/70"
        />
        <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:block">ESC</kbd>
      </div>
      <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
        {entries.map((e, i) => (
          <li key={e.id} role="presentation">
            <button
              type="button"
              id={`pal-${e.id}`}
              role="option"
              aria-selected={i === cursor}
              onMouseMove={() => setCursor(i)}
              onClick={() => go(e)}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] ${i === cursor ? "bg-accent/10 text-text" : "text-muted"}`}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-text">{e.label}</span>
              <span className="shrink-0 text-xs">{e.hint}</span>
              {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            </button>
          </li>
        ))}
        {!entries.length && <li className="px-3 py-8 text-center text-xs text-muted">Nothing matches</li>}
      </ul>
    </dialog>
  );
}
