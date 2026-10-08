"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { AGE_COOKIE, PREFS_COOKIE, serializePrefs } from "@/lib/prefs";
import { LANGUAGES } from "@/lib/format";
import { LogoMark } from "./Logo";

const QUICK = ["en", "ja", "zh", "ko", "es", "fr", "de", "ru"];

/**
 * Shown once, before anything else. Confirms the visitor is an adult and lets them pick languages up front,
 * so the very first page they see is already in their language.
 */
export function AgeGate({ initialLangs }: { initialLangs: string[] }) {
  const router = useRouter();
  const enter = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  const [langs, setLangs] = useState<string[]>(initialLangs.length ? initialLangs : ["en"]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    enter.current?.focus();
  }, []);

  if (!open) return null;

  const accept = () => {
    const year = 60 * 60 * 24 * 365;
    document.cookie = `${AGE_COOKIE}=1; path=/; max-age=${year}; samesite=lax`;
    document.cookie = `${PREFS_COOKIE}=${serializePrefs({ langs: all ? [] : langs, hide: [] })}; path=/; max-age=${year}; samesite=lax`;
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-bg/70 p-4 backdrop-blur-sm animate-fade" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="card w-full max-w-md space-y-6 p-6 shadow-card animate-pop sm:p-8">
        <div className="flex items-center gap-3">
          <LogoMark className="h-11 w-11" />
          <div>
            <h1 id="gate-title" className="font-display text-xl font-extrabold leading-tight">
              Adults only
            </h1>
            <p className="text-sm text-muted">This site contains explicit material.</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted">
          You must be at least 18 years old (or the age of majority where you live) to enter. By continuing you confirm that you are, and that viewing
          adult material is legal where you are.
        </p>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">Which languages do you read?</legend>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((code) => {
              const label = LANGUAGES.find((l) => l.code === code)!.label;
              const on = !all && langs.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  disabled={all}
                  onClick={() => setLangs((l) => (l.includes(code) ? l.filter((x) => x !== code) : [...l, code]))}
                  className={`chip min-h-[40px] px-3 ${on ? "chip-active" : ""} ${all ? "opacity-40" : ""}`}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                  {label}
                </button>
              );
            })}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Show every language
          </label>
          <p className="text-xs text-muted">You can change this any time in Settings.</p>
        </fieldset>

        <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
          <button ref={enter} type="button" onClick={accept} className="btn-primary">
            I am 18 or older, enter
          </button>
          <a href="https://www.google.com" rel="noopener noreferrer" className="btn-soft">
            Leave
          </a>
        </div>
      </div>
    </div>
  );
}
