"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, Download, TriangleAlert } from "lucide-react";
import { AuthHeading, ErrorLine, Submit } from "./parts";

export function SetupForm({ secret, qr }: { secret: string; qr: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState<"key" | "codes" | null>(null);

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

  const copy = async (text: string, what: "key" | "codes") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked: the text is on screen to copy by hand */
    }
  };

  if (codes) {
    const all = codes.join("\n");
    return (
      <div className="space-y-4">
        <AuthHeading title="Save your recovery codes" hint="Each code works once if you lose your authenticator. They are shown only now." />
        <p className="flex gap-2.5 rounded-lg bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-muted ring-1 ring-inset ring-warn/25">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          Store them in a password manager. Without a code or your authenticator you cannot get back in.
        </p>
        <ul className="grid grid-cols-2 gap-1.5 rounded-xl bg-bg p-3 font-mono text-[13px] ring-1 ring-inset ring-line" aria-label="Recovery codes">
          {codes.map((c) => <li key={c} className="select-all rounded-md bg-surface-2 px-2 py-1.5 text-center">{c}</li>)}
        </ul>
        <div className="flex gap-2">
          <button type="button" onClick={() => copy(all, "codes")} className="c-btn-default flex-1">
            {copied === "codes" ? <Check className="h-4 w-4 text-good" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} {copied === "codes" ? "Copied" : "Copy all"}
          </button>
          <a className="c-btn-default flex-1" href={`data:text/plain;charset=utf-8,${encodeURIComponent(all + "\n")}`} download="lustpages-console-recovery-codes.txt">
            <Download className="h-4 w-4" aria-hidden="true" /> Download
          </a>
        </div>
        <button onClick={() => router.replace("/console")} className="c-btn-primary !min-h-[46px] w-full !text-[14px]">
          I have saved them: enter the console
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <AuthHeading title="Set up two-factor" hint="Protects the console even if your password leaks. Takes a minute." />
      <ol className="space-y-5 text-[13px]">
        <li>
          <p className="mb-3 font-semibold"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-accent-fill text-[11px] text-white">1</span>Scan with Google Authenticator, Authy or 1Password</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code to add this account to your authenticator app" width={176} height={176} className="mx-auto rounded-xl bg-white p-2.5" />
          <details className="mt-3 text-xs text-muted">
            <summary className="c-tap cursor-pointer font-medium hover:text-text">Cannot scan? Enter the key by hand</summary>
            <div className="mt-2 flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-bg p-2.5 font-mono text-[11px] text-text ring-1 ring-inset ring-line">{secret}</code>
              <button type="button" onClick={() => copy(secret, "key")} className="c-btn-default shrink-0" aria-label="Copy the key">
                {copied === "key" ? <Check className="h-4 w-4 text-good" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </details>
        </li>
        <li>
          <label htmlFor="enroll-code" className="mb-2 block font-semibold"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-accent-fill text-[11px] text-white">2</span>Enter the 6-digit code to confirm</label>
          <input
            id="enroll-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="c-input !min-h-[56px] text-center font-mono !text-2xl tracking-[0.35em]"
          />
        </li>
      </ol>
      <ErrorLine message={err} />
      <Submit busy={busy} disabled={code.length !== 6}>Confirm and finish</Submit>
    </form>
  );
}
