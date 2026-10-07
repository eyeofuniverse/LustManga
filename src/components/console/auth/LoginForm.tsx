"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const input =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent/50";

export function LoginForm({ needsBootstrap }: { needsBootstrap: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const url = needsBootstrap
        ? "/api/console/auth/bootstrap"
        : "/api/console/auth/login";
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          needsBootstrap ? { email, password, secret } : { email, password },
        ),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error ?? "Something went wrong.");
        return;
      }
      router.replace(data.next === "totp" ? "/console/verify" : "/console/setup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {needsBootstrap && (
        <p className="rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-white/70">
          First-time setup. Create the owner account, then you&apos;ll enrol an
          authenticator app.
        </p>
      )}
      <input
        type="email"
        autoComplete="username"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
        required
      />
      <input
        type="password"
        autoComplete={needsBootstrap ? "new-password" : "current-password"}
        placeholder={needsBootstrap ? "Password (12+ characters)" : "Password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={input}
        required
      />
      {needsBootstrap && (
        <input
          type="password"
          placeholder="Setup key (ADMIN_BOOTSTRAP_SECRET)"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className={input}
          required
        />
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2.5 text-sm font-bold text-white transition disabled:opacity-60"
      >
        {busy ? "…" : needsBootstrap ? "Create owner account" : "Continue"}
      </button>
    </form>
  );
}
