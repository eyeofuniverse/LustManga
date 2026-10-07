"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerifyForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/console/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error ?? "Invalid code.");
        return;
      }
      router.replace("/console");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-center text-sm text-white/60">
        Enter the 6-digit code from your authenticator app.
      </p>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^0-9a-z-]/gi, "").slice(0, 20))}
        className="w-full rounded-lg border border-white/10 bg-black/30 py-3 text-center font-mono text-2xl tracking-[0.4em] text-white outline-none focus:border-accent/50"
      />
      {err && <p className="text-center text-xs text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? "…" : "Verify"}
      </button>
      <p className="text-center text-[11px] text-white/30">
        Lost your device? Enter a backup recovery code instead.
      </p>
    </form>
  );
}
