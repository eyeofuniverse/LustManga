import Link from "next/link";
import { Logo } from "./Logo";
import { SITE_NAME } from "@/lib/site";

const COLS = [
  {
    title: "Explore",
    links: [
      ["Browse all", "/browse"],
      ["Newest", "/browse?sort=new"],
      ["Tags", "/tags"],
      ["Artists", "/artists"],
      ["Random", "/random"],
    ],
  },
  {
    title: "Your library",
    links: [
      ["Saved", "/favorites"],
      ["History", "/history"],
      ["Settings", "/settings"],
      ["Search help", "/search/help"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["DMCA / takedown", "/dmca"],
      ["18 U.S.C. 2257", "/2257"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Report content", "/report-content"],
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface/50">
      <div className="container-x grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            Manga and doujinshi in every language, collected from across the web. Fast to browse, comfortable to read.
          </p>
          <p className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-fill text-[10px] font-extrabold text-white">18</span>
            Adults only
          </p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="mb-3 font-display text-sm font-bold">{c.title}</h2>
            <ul className="space-y-1.5">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="inline-block py-1 text-sm text-muted transition hover:text-text">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="container-x py-5 text-xs text-muted">
          &copy; {new Date().getFullYear()} {SITE_NAME}. We host no content by claim of ownership; to request removal see the DMCA page.
        </p>
      </div>
    </footer>
  );
}
