"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { ok: boolean; message: string };

/** A form that runs a server action, shows its result inline, and refreshes the page data. */
export function ActionForm({
  action,
  children,
  className = "",
  confirm,
}: {
  action: (fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result | null>(null);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const form = e.currentTarget;
        start(async () => {
          const r = await action(new FormData(form));
          setMsg(r);
          if (r.ok) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {msg && <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.message}</p>}
    </form>
  );
}

/** One-click action button (no inputs). */
export function ActionButton({
  action,
  label,
  tone = "default",
  confirm,
}: {
  action: () => Promise<Result>;
  label: string;
  tone?: "default" | "good" | "bad";
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result | null>(null);
  const color =
    tone === "good" ? "bg-emerald-600 hover:bg-emerald-500" : tone === "bad" ? "bg-red-600 hover:bg-red-500" : "bg-surface-2 hover:bg-white/10";
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${color}`}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setMsg(r);
            if (r.ok) router.refresh();
          });
        }}
      >
        {pending ? "..." : label}
      </button>
      {msg && <span className={`mt-1 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.message}</span>}
    </span>
  );
}

/** Small x button used to remove a chip (term / alias). */
export function ChipRemove({ action, label }: { action: () => Promise<Result>; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <button
      type="button"
      title={err ?? `Remove ${label}`}
      disabled={pending}
      className={`ml-1 rounded px-1 text-xs hover:bg-white/10 ${err ? "text-red-400" : "text-white/50"}`}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (r.ok) router.refresh();
          else setErr(r.message);
        })
      }
    >
      x
    </button>
  );
}
