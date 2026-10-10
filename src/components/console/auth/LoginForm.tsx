"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AuthHeading, ErrorLine, Field, PasswordField, Submit } from "./parts";

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
      const url = needsBootstrap ? "/api/console/auth/bootstrap" : "/api/console/auth/login";
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(needsBootstrap ? { email, password, secret } : { email, password }),
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
    <form onSubmit={submit} className="space-y-4" noValidate={false}>
      <AuthHeading
        title={needsBootstrap ? "Create the owner account" : "Sign in"}
        hint={needsBootstrap ? "First-time setup. You will enrol an authenticator app in the next step." : "Use your admin email and password. A code from your authenticator app comes next."}
      />
      {needsBootstrap && (
        <p className="flex gap-2.5 rounded-lg bg-accent/10 px-3 py-2.5 text-xs leading-relaxed text-muted ring-1 ring-inset ring-accent/20">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          No admin exists yet, so this creates the owner. You need the setup key from the server configuration.
        </p>
      )}
      <Field label="Email" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      <PasswordField label="Password" autoComplete={needsBootstrap ? "new-password" : "current-password"} placeholder={needsBootstrap ? "12 or more characters" : "Your password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={needsBootstrap ? 12 : undefined} />
      {needsBootstrap && (
        <PasswordField label="Setup key" autoComplete="off" placeholder="ADMIN_BOOTSTRAP_SECRET" value={secret} onChange={(e) => setSecret(e.target.value)} required />
      )}
      <ErrorLine message={err} />
      <Submit busy={busy}>{needsBootstrap ? "Create owner account" : "Continue"}</Submit>
    </form>
  );
}
