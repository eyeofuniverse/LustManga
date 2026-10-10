import { Fingerprint, KeyRound, ScrollText } from "lucide-react";

const POINTS = [
  { icon: KeyRound, title: "Password and authenticator", text: "Every sign-in needs both, and a recovery code if you lose your device." },
  { icon: Fingerprint, title: "A hidden console", text: "Without a session this address does not exist. It is never indexed." },
  { icon: ScrollText, title: "Everything is logged", text: "Each change is recorded in the audit log with who and when." },
];

/** The frame around every sign-in step: brand panel on a wide screen, a clean centred card on a phone. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12" aria-hidden="false">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-accent-2/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-glow" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4v13a3 3 0 0 0 3 3h9" />
              <path d="M10 8h7M10 12h4" />
            </svg>
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight">Lust<span className="text-accent">Pages</span> <span className="font-medium text-muted">Console</span></span>
        </div>
        <div className="relative max-w-md space-y-8">
          <h2 className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight">Run the catalogue, keep it safe.</h2>
          <ul className="space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                <span>
                  <span className="block text-[14px] font-semibold">{title}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted">Restricted area. Authorised administrators only.</p>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-glow" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4v13a3 3 0 0 0 3 3h9" />
                <path d="M10 8h7M10 12h4" />
              </svg>
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">Lust<span className="text-accent">Pages</span> <span className="font-medium text-muted">Console</span></span>
          </div>
          <div className="c-card c-card-pad !p-6 sm:!p-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
