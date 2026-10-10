"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthHeading, ErrorLine, Submit } from "./parts";

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
    <form onSubmit={submit} className="space-y-4">
      <AuthHeading title="Two-step verification" hint="Enter the 6-digit code from your authenticator app." />
      <div>
        <label htmlFor="otp" className="c-label">Verification code</label>
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9a-z-]/gi, "").slice(0, 20))}
          className="c-input !min-h-[56px] text-center font-mono !text-2xl tracking-[0.35em]"
          aria-describedby="otp-hint"
        />
        <p id="otp-hint" className="mt-1.5 text-center text-[11px] text-muted">Lost your device? Enter a backup recovery code instead.</p>
      </div>
      <ErrorLine message={err} />
      <Submit busy={busy} disabled={code.length < 6}>Verify</Submit>
    </form>
  );
}
