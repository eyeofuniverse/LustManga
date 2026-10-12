"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, LogOut, Trash2 } from "lucide-react";
import { changePasswordAction, deleteAccountAction, regenerateCodesAction, signOutAction, updateProfileAction } from "@/lib/member/actions";
import { Alert, Codes, FIELD, Field, PasswordInput } from "./AuthForms";

function useAction() {
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return { error, setError, note, setNote, pending, start };
}

function Status({ error, note }: { error: string; note: string }) {
  return (
    <>
      {error && <Alert>{error}</Alert>}
      {note && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-good/40 bg-good/10 px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-good" aria-hidden="true" /> {note}
        </p>
      )}
    </>
  );
}

export function ProfileForm({ displayName, bio, email, showRatings }: { displayName: string; bio: string; email: string; showRatings: boolean }) {
  const router = useRouter();
  const s = useAction();
  const [v, setV] = useState({ displayName, bio, email, showRatings });
  return (
    <form
      className="card space-y-5 p-5 sm:p-6"
      aria-busy={s.pending}
      onSubmit={(e) => {
        e.preventDefault();
        s.setError("");
        s.setNote("");
        s.start(async () => {
          const r = await updateProfileAction(v);
          if (!r.ok) return s.setError(r.message);
          s.setNote("Saved.");
          router.refresh();
        });
      }}
    >
      <Status error={s.error} note={s.note} />
      <Field label="Display name" htmlFor="pf-name" hint="Your username, with the capital letters you like. The letters themselves cannot change.">
        <input id="pf-name" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} maxLength={20} required className={`${FIELD} h-12`} />
      </Field>
      <Field label="About you" htmlFor="pf-bio" hint="Optional, up to 300 characters. No links or contact details.">
        <textarea id="pf-bio" value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} maxLength={300} rows={3} className={`${FIELD} py-3`} />
      </Field>
      <Field label="Email (optional)" htmlFor="pf-email" hint="Kept private.">
        <input id="pf-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} maxLength={200} className={`${FIELD} h-12`} />
      </Field>
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
        <input type="checkbox" checked={v.showRatings} onChange={(e) => setV({ ...v, showRatings: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--accent))]" />
        <span>Show my star ratings on my public profile. Off by default: your comments are always public, your ratings are private unless you tick this.</span>
      </label>
      <button className="btn-primary h-11 px-8" disabled={s.pending}>
        {s.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
      </button>
    </form>
  );
}

export function PasswordForm() {
  const s = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <form
      className="card space-y-5 p-5 sm:p-6"
      aria-busy={s.pending}
      onSubmit={(e) => {
        e.preventDefault();
        s.setError("");
        s.setNote("");
        s.start(async () => {
          const r = await changePasswordAction({ current, next });
          if (!r.ok) return s.setError(r.message);
          setCurrent("");
          setNext("");
          s.setNote("Password changed. Other devices have been signed out.");
        });
      }}
    >
      <Status error={s.error} note={s.note} />
      <Field label="Current password" htmlFor="pw-cur">
        <PasswordInput id="pw-cur" name="current" value={current} onChange={setCurrent} autoComplete="current-password" label="current password" />
      </Field>
      <Field label="New password" htmlFor="pw-new" hint="At least 8 characters.">
        <PasswordInput id="pw-new" name="next" value={next} onChange={setNext} autoComplete="new-password" label="new password" />
      </Field>
      <button className="btn-primary h-11 px-8" disabled={s.pending}>
        {s.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Change password
      </button>
    </form>
  );
}

export function CodesForm({ username, left }: { username: string; left: number }) {
  const s = useAction();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  if (codes) return <Codes codes={codes} username={username} doneLabel="Done" onDone={() => setCodes(null)} />;
  return (
    <form
      className="card space-y-5 p-5 sm:p-6"
      aria-busy={s.pending}
      onSubmit={(e) => {
        e.preventDefault();
        s.setError("");
        s.start(async () => {
          const r = await regenerateCodesAction({ password });
          if (!r.ok) return s.setError(r.message);
          setPassword("");
          setCodes(r.codes);
        });
      }}
    >
      <Status error={s.error} note={s.note} />
      <p className="text-sm leading-relaxed text-muted">
        You have <b className="text-text">{left}</b> unused recovery code{left === 1 ? "" : "s"}. They are the only way back in if you forget your password. Making new ones replaces all the old ones.
      </p>
      <Field label="Your password" htmlFor="rc-pass">
        <PasswordInput id="rc-pass" name="password" value={password} onChange={setPassword} autoComplete="current-password" />
      </Field>
      <button className="btn-soft h-11 px-6" disabled={s.pending}>
        {s.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Make new codes
      </button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-soft h-11 px-5"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOutAction();
          router.replace("/");
          router.refresh();
        })
      }
    >
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}

export function DeleteForm() {
  const router = useRouter();
  const s = useAction();
  const [password, setPassword] = useState("");
  const [sure, setSure] = useState(false);
  return (
    <form
      className="card space-y-5 border-bad/40 p-5 sm:p-6"
      aria-busy={s.pending}
      onSubmit={(e) => {
        e.preventDefault();
        s.setError("");
        if (!sure) return s.setError("Tick the box to confirm.");
        s.start(async () => {
          const r = await deleteAccountAction({ password });
          if (!r.ok) return s.setError(r.message);
          router.replace("/");
          router.refresh();
        });
      }}
    >
      <Status error={s.error} note={s.note} />
      <p className="text-sm leading-relaxed text-muted">Deleting your account removes your profile, your ratings and your sign-in. Your comments are emptied: one that has replies stays as &ldquo;[deleted]&rdquo; so the conversation still reads. This cannot be undone.</p>
      <Field label="Your password" htmlFor="del-pass">
        <PasswordInput id="del-pass" name="password" value={password} onChange={setPassword} autoComplete="current-password" />
      </Field>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[rgb(var(--accent))]" />
        <span>Yes, delete my account for good.</span>
      </label>
      <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-bad px-6 text-sm font-bold text-white disabled:opacity-60" disabled={s.pending}>
        {s.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete my account
      </button>
    </form>
  );
}
