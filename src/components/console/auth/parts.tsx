"use client";

import { useId, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";

export function AuthHeading({ title, hint }: { title: string; hint?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[22px] font-extrabold tracking-tight">{title}</h1>
      {hint && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  className = "",
  inputClass = "",
  ...input
}: { label: string; hint?: string; inputClass?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="c-label">{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...input} className={`c-input !min-h-[44px] !text-[14px] ${inputClass}`} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function PasswordField({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="c-label">{label}</label>
      <div className="relative">
        <input id={id} {...input} type={show ? "text" : "password"} className="c-input !min-h-[44px] !pr-11 !text-[14px]" />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide the password" : "Show the password"}
          aria-pressed={show}
          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return (
    <div role="alert" aria-live="assertive">
      {message && (
        <p className="c-rise flex items-start gap-2 rounded-lg bg-bad/10 px-3 py-2.5 text-[13px] text-bad ring-1 ring-inset ring-bad/25">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}

export function Submit({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={busy || disabled} className="c-btn-primary !min-h-[46px] w-full !text-[14px]">
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
