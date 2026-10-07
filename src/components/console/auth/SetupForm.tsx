"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SetupForm({ secret, qr }: { secret: string; qr: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/console/auth/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error ?? "Invalid code.");
        return;
      }
      setCodes(data.backupCodes ?? []);
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-white/70">
          Save these backup recovery codes somewhere safe. Each works once if you
          lose your authenticator. They won&apos;t be shown again.
        </p>
        <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs">
          {codes.map((c) => (
            <span key={c} className="text-white/80">
              {c}
            </span>
          ))}
        </div>
        <button
          onClick={() => router.replace("/console")}
          className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2.5 text-sm font-bold text-white"
        >
          I&apos;ve saved them — enter the console
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-white/70">
        Scan this with Google Authenticator, Authy, or 1Password.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qr}
        alt="TOTP QR code"
        width={180}
        height={180}
        className="mx-auto rounded-lg bg-white p-2"
      />
      <details className="text-xs text-white/40">
        <summary className="cursor-pointer">Can&apos;t scan? Enter this key</summary>
        <code className="mt-1 block break-all rounded bg-black/30 p-2 text-white/70">
          {secret}
        </code>
      </details>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="Enter the 6-digit code to confirm"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="w-full rounded-lg border border-white/10 bg-black/30 py-3 text-center font-mono text-xl tracking-[0.3em] text-white outline-none focus:border-accent/50"
      />
      {err && <p className="text-center text-xs text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? "…" : "Confirm & finish"}
      </button>
    </form>
  );
}
