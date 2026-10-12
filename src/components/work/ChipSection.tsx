import Link from "next/link";
import { compact, tagHref } from "@/lib/format";
import { SectionHeader } from "@/components/work/Section";

type Item = { id: number | string; name: string; slug: string; count: number };

/** a placeholder credit is not somebody to browse */
const PLACEHOLDER = /^(unknown|various|anonymous|n\/a|none|-)$/i;

/** A titled cloud of links to tag, artist, parody, language ... pages, each with how many works it holds. */
export function ChipSection({ title, type, items: all, href, label, sub, className = "pt-12 sm:pt-16" }: { title: string; type: string; items: Item[]; href?: string; label?: string; sub?: string; className?: string }) {
  const items = type === "artist" || type === "group" ? all.filter((t) => !PLACEHOLDER.test(t.name.trim())) : all;
  if (!items.length) return null;
  return (
    <section className={className} aria-label={title}>
      <SectionHeader title={title} href={href} label={label} sub={sub} />
      <ul className="flex flex-wrap gap-2">
        {items.map((t) => (
          <li key={t.id}>
            <Link href={tagHref(type, t.slug)} className={`chip min-h-[38px] px-3.5${type === "language" ? " capitalize" : ""}`}>
              {t.name}
              <span className="text-xs font-normal text-muted">{compact(t.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
