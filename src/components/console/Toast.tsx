"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastTone = "good" | "bad" | "info";
export type ConfirmOptions = { title?: string; message: string; confirmLabel?: string; tone?: "bad" | "default" };

interface Ctx {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}

const Context = createContext<Ctx | null>(null);

/** Feedback and confirmation for every console action: a toast for the result, a real dialog instead of window.confirm. */
export function useConsole(): Ctx {
  const c = useContext(Context);
  if (c) return c;
  // outside the provider (should not happen): behave like the old browser prompts rather than crash
  return {
    toast: () => undefined,
    confirm: async (o) => (typeof window === "undefined" ? false : window.confirm(o.message)),
  };
}

interface Item {
  id: number;
  message: string;
  tone: ToastTone;
}

const ICON = { good: CheckCircle2, bad: AlertTriangle, info: Info } as const;
const COLOR = { good: "text-good", bad: "text-bad", info: "text-info" } as const;

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = "good") => {
    const id = next.current++;
    setItems((cur) => [...cur.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), tone === "bad" ? 8000 : 4000);
  }, []);

  /* the confirmation dialog: one <dialog>, opened with showModal() so focus is trapped and Escape closes it */
  const dialog = useRef<HTMLDialogElement>(null);
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...o, resolve })), []);
  useEffect(() => {
    if (ask && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [ask]);
  const close = (ok: boolean) => {
    ask?.resolve(ok);
    dialog.current?.close();
    setAsk(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <Context.Provider value={value}>
      {children}

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end">
        {items.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} className="c-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 shadow-card">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR[t.tone]}`} aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-text">{t.message}</p>
              <button type="button" aria-label="Dismiss" className="-m-1 rounded p-1 text-muted hover:text-text" onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        onClick={(e) => e.target === dialog.current && close(false)}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-0 text-text shadow-card backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        aria-labelledby="confirm-title"
      >
        {ask && (
          <div className="c-rise p-5">
            <div className="flex items-start gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${ask.tone === "bad" ? "bg-bad/10 text-bad" : "bg-info/10 text-info"}`}>
                {ask.tone === "bad" ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Info className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <h2 id="confirm-title" className="font-display text-base font-bold">{ask.title ?? "Are you sure?"}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{ask.message}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="c-btn-default" onClick={() => close(false)}>Cancel</button>
              <button type="button" autoFocus className={ask.tone === "bad" ? "c-btn-bad" : "c-btn-primary"} onClick={() => close(true)}>
                {ask.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </Context.Provider>
  );
}
