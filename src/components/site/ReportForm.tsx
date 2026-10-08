"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

const KINDS = [
  { v: "DMCA", l: "Copyright / takedown request" },
  { v: "BROKEN", l: "Broken or missing pages" },
  { v: "OTHER", l: "Something else (including content that should not be here)" },
] as const;

export function ReportForm({ work }: { work?: number }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["v"]>("BROKEN");
  const [workId, setWorkId] = useState(work ? String(work) : "");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const r = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, work: workId.replace(/\D/g, "") || undefined, details, contact: contact || undefined }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Could not send the report.");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  if (state === "done")
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center" role="status">
        <CheckCircle2 className="h-12 w-12 text-good" />
        <h2 className="font-display text-xl font-bold">Report received</h2>
        <p className="max-w-sm text-sm text-muted">Thank you. We review every report, and act quickly on takedown requests and anything involving possible minors or non-consent.</p>
      </div>
    );

  const field = "w-full rounded-xl border border-line bg-surface-2/70 px-4 text-sm placeholder:text-muted/70 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30";
  return (
    <form onSubmit={submit} className="card space-y-5 p-5 sm:p-7" noValidate>
      <fieldset className="space-y-2.5">
        <legend className="mb-1 text-sm font-semibold">What is this about?</legend>
        {KINDS.map((k) => (
          <label key={k.v} className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm transition ${kind === k.v ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2"}`}>
            <input type="radio" name="kind" value={k.v} checked={kind === k.v} onChange={() => setKind(k.v)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            {k.l}
          </label>
        ))}
      </fieldset>

      <label className="block space-y-1.5 text-sm font-semibold">
        Work number or link <span className="font-normal text-muted">(optional)</span>
        <input value={workId} onChange={(e) => setWorkId(e.target.value)} inputMode="numeric" placeholder="e.g. 1234, or paste the page address" className={`${field} h-12`} />
      </label>

      <label className="block space-y-1.5 text-sm font-semibold">
        Details
        <textarea required minLength={10} maxLength={4000} rows={6} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={kind === "DMCA" ? "Identify the work you own, and where it appears here." : "What is wrong?"} className={`${field} resize-y py-3 leading-relaxed`} />
      </label>

      <label className="block space-y-1.5 text-sm font-semibold">
        Your email {kind === "DMCA" ? <span className="font-normal text-accent">(required)</span> : <span className="font-normal text-muted">(optional, only if you want a reply)</span>}
        <input type="email" required={kind === "DMCA"} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" className={`${field} h-12`} />
      </label>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={state === "sending" || details.trim().length < 10} className="btn-primary h-12 w-full sm:w-auto sm:px-8">
        <Send className="h-4 w-4" /> {state === "sending" ? "Sending" : "Send report"}
      </button>
    </form>
  );
}
