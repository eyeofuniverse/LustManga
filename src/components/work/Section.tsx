import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeader({ title, href, label = "View all", sub }: { title: string; href?: string; label?: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-muted transition hover:text-accent">
          {label}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

export function PageHeading({ title, sub, eyebrow, children }: { title: string; sub?: React.ReactNode; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted sm:text-base">{sub}</p>}
      </div>
      {children}
    </header>
  );
}
