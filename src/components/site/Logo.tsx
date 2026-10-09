import Link from "next/link";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`relative grid place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 shadow-[0_8px_24px_-8px_rgb(var(--accent)/0.8)] ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%] text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4v13a3 3 0 0 0 3 3h9" />
        <path d="M10 8h7M10 12h4" />
      </svg>
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" aria-label="LustPages, home" className="group flex shrink-0 items-center gap-2.5">
      <span className="transition duration-300 group-hover:-rotate-6 group-hover:scale-105">
        <LogoMark />
      </span>
      <span className="font-display text-[19px] font-extrabold tracking-tight">
        Lust<span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">Pages</span>
      </span>
    </Link>
  );
}
