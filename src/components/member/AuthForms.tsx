"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Download, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { resetPasswordAction, signInAction, signUpAction } from "@/lib/member/actions";

export const FIELD = "w-full rounded-xl border border-line bg-surface-2/70 px-4 text-sm placeholder:text-muted/70 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-text">
      {children}
    </p>
  );
}

/** A password box with a show/hide button. */
export function PasswordInput({ id, name, value, onChange, autoComplete, placeholder, label = "password" }: { id: string; name: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string; label?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} required maxLength={200} className={`${FIELD} h-12 pr-12`} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? `Hide ${label}` : `Show ${label}`} aria-pressed={show} className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ───────────── sign in ───────────── */

/**
 * Whether the visitor was already signed in when the page opened. Remembered at the start: signing in or up sets the cookie,
 * Next then re-renders the page with a member in it, and a form that reacted to that would vanish (taking the recovery codes
 * with it).
 */
function useWasSignedIn(name: string | null | undefined): string | null {
  const [was] = useState(name ?? null);
  return was;
}

function AlreadyIn({ name, to }: { name: string; to: string }) {
  return (
    <div className="card space-y-3 p-5 text-center sm:p-7" role="status">
      <p className="text-sm">
        You are already signed in as <b>{name}</b>.
      </p>
      <Link href={to} className="btn-primary h-11 px-8">
        Go on
      </Link>
    </div>
  );
}

export function SignInForm({ next, signedInAs }: { next?: string; signedInAs?: string | null }) {
  const router = useRouter();
  const already = useWasSignedIn(signedInAs);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (already) return <AlreadyIn name={already} to={next || "/account"} />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await signInAction({ username, password, next });
      if (!r.ok) return setError(r.message);
      router.replace(r.next);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-7" aria-busy={pending}>
      {error && <Alert>{error}</Alert>}
      <Field label="Username" htmlFor="si-user">
        <input id="si-user" name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={40} className={`${FIELD} h-12`} />
      </Field>
      <Field label="Password" htmlFor="si-pass">
        <PasswordInput id="si-pass" name="password" value={password} onChange={setPassword} autoComplete="current-password" />
      </Field>
      <button className="btn-primary h-12 w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sign in
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/forgot" className="text-accent underline underline-offset-2">Forgot your password?</Link>
      </p>
    </form>
  );
}

/* ───────────── sign up ───────────── */

export function Codes({ codes, username, onDone, doneLabel = "Continue" }: { codes: string[]; username: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `LustPages recovery codes for ${username}\nEach code works once, to set a new password if you forget it.\n\n${codes.join("\n")}\n`;
  return (
    <div className="card space-y-5 p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <h2 className="font-display text-xl font-bold">Save your recovery codes</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            These codes are the only way back into your account if you forget your password. Each works once. They are shown only now.
          </p>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2/60 p-4 font-mono text-[15px] tracking-wide ring-1 ring-line sm:grid-cols-4" aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-soft h-11 px-4" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})}>
          {copied ? <CheckCircle2 className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
        </button>
        <a className="btn-soft h-11 px-4" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download={`lustpages-recovery-codes-${username}.txt`}>
          <Download className="h-4 w-4" /> Download
        </a>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[rgb(var(--accent))]" />
        <span>I have saved these codes somewhere safe.</span>
      </label>
      <button className="btn-primary h-12 w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}

export function SignUpForm({ next, signedInAs }: { next?: string; signedInAs?: string | null }) {
  const router = useRouter();
  const already = useWasSignedIn(signedInAs);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // a trap for scripts: people never see it
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ codes: string[]; next: string; username: string } | null>(null);
  const [pending, start] = useTransition();

  if (already && !done) return <AlreadyIn name={already} to={next || "/account"} />;
  if (done)
    return (
      <Codes
        codes={done.codes}
        username={done.username}
        onDone={() => {
          router.replace(done.next);
          router.refresh();
        }}
      />
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!agree) return setError("Please confirm that you are 18 or older and accept the rules.");
    start(async () => {
      const r = await signUpAction({ username, password, email, next, website });
      if (!r.ok) return setError(r.message);
      setDone({ codes: r.codes, next: r.next, username: username.trim() });
    });
  };

  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-7" aria-busy={pending}>
      {error && <Alert>{error}</Alert>}
      <Field label="Username" htmlFor="su-user" hint="3 to 20 letters, digits or underscores. This is your public name and you sign in with it.">
        <input id="su-user" name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={20} className={`${FIELD} h-12`} />
      </Field>
      <Field label="Password" htmlFor="su-pass" hint="At least 8 characters.">
        <PasswordInput id="su-pass" name="password" value={password} onChange={setPassword} autoComplete="new-password" />
      </Field>
      <Field label="Email (optional)" htmlFor="su-email" hint="Kept private.">
        <input id="su-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} className={`${FIELD} h-12`} />
      </Field>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--accent))]" />
        <span>
          I am 18 or older and I accept the <Link href="/terms" className="text-accent underline underline-offset-2" target="_blank">terms and community rules</Link> and the <Link href="/privacy" className="text-accent underline underline-offset-2" target="_blank">privacy policy</Link>.
        </span>
      </label>
      <button className="btn-primary h-12 w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create account
      </button>
    </form>
  );
}

/* ───────────── lost password ───────────── */

export function ResetForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [pending, start] = useTransition();

  if (left !== null)
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center" role="status">
        <CheckCircle2 className="h-12 w-12 text-good" />
        <h2 className="font-display text-xl font-bold">Password changed</h2>
        <p className="max-w-sm text-sm text-muted">You are signed in. That code is used up; you have {left} recovery code{left === 1 ? "" : "s"} left{left <= 2 ? ". Make new ones in your account settings soon" : ""}.</p>
        <button
          className="btn-primary mt-2 h-11 px-8"
          onClick={() => {
            router.replace("/account");
            router.refresh();
          }}
        >
          Go to my account
        </button>
      </div>
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await resetPasswordAction({ username, code, password });
      if (!r.ok) return setError(r.message);
      setLeft(r.codesLeft);
    });
  };

  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-7" aria-busy={pending}>
      {error && <Alert>{error}</Alert>}
      <Field label="Username" htmlFor="rs-user">
        <input id="rs-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={40} className={`${FIELD} h-12`} />
      </Field>
      <Field label="A recovery code" htmlFor="rs-code" hint="One of the eight codes you saved when you signed up, like k7m2-9qxp.">
        <input id="rs-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={20} className={`${FIELD} h-12 font-mono tracking-wide`} />
      </Field>
      <Field label="New password" htmlFor="rs-pass" hint="At least 8 characters.">
        <PasswordInput id="rs-pass" name="password" value={password} onChange={setPassword} autoComplete="new-password" label="new password" />
      </Field>
      <button className="btn-primary h-12 w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Set new password
      </button>
    </form>
  );
}
