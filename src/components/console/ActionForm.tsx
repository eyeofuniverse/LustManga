"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { useConsole, type ConfirmOptions } from "./Toast";

type Result = { ok: boolean; message: string };
const EXPIRED = "That did not go through (your session may have expired). Reload and try again.";

/** A string is shorthand for the dialog text; an object can also set the title and button label. */
type Confirm = string | ConfirmOptions;
const asOptions = (c: Confirm, label: string, tone: "bad" | "default"): ConfirmOptions =>
  typeof c === "string" ? { message: c, confirmLabel: label, tone } : { confirmLabel: label, tone, ...c };

/** A form that runs a server action, reports the result as a toast, and refreshes the page data. */
export function ActionForm({
  action,
  children,
  className = "",
  confirm,
  confirmLabel = "Confirm",
  danger = false,
}: {
  action: (fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  confirm?: Confirm;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const router = useRouter();
  const ui = useConsole();
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      aria-busy={pending}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (confirm && !(await ui.confirm(asOptions(confirm, confirmLabel, danger ? "bad" : "default")))) return;
        start(async () => {
          try {
            const r = await action(new FormData(form));
            ui.toast(r.message, r.ok ? "good" : "bad");
            if (r.ok) {
              form.reset();
              router.refresh();
            }
          } catch {
            ui.toast(EXPIRED, "bad");
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}

const TONE = { default: "c-btn-default", good: "c-btn-good", bad: "c-btn-bad", primary: "c-btn-primary" } as const;

/** One-click action button (no inputs). */
export function ActionButton({
  action,
  label,
  tone = "default",
  confirm,
  icon,
  title,
}: {
  action: () => Promise<Result>;
  label: string;
  tone?: keyof typeof TONE;
  confirm?: Confirm;
  /** an icon shown before the label; the label stays visible for screen readers on its own */
  icon?: React.ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const ui = useConsole();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={title}
      className={TONE[tone]}
      onClick={async () => {
        if (confirm && !(await ui.confirm(asOptions(confirm, label, tone === "bad" ? "bad" : "default")))) return;
        start(async () => {
          try {
            const r = await action();
            ui.toast(r.message, r.ok ? "good" : "bad");
            if (r.ok) router.refresh();
          } catch {
            ui.toast(EXPIRED, "bad");
          }
        });
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : icon}
      {label}
    </button>
  );
}

/** Small x button used to remove a chip (term / alias). */
export function ChipRemove({ action, label }: { action: () => Promise<Result>; label: string }) {
  const router = useRouter();
  const ui = useConsole();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Remove ${label}`}
      title={`Remove ${label}`}
      disabled={pending}
      className="c-icon-x"
      onClick={() =>
        start(async () => {
          try {
            const r = await action();
            if (r.ok) router.refresh();
            else ui.toast(r.message, "bad");
          } catch {
            ui.toast(EXPIRED, "bad");
          }
        })
      }
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}
