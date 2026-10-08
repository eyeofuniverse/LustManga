# LustManga

An automated manga and doujinshi catalogue. Sources are scraped on a schedule by GitHub Actions, pages are
re-encoded to WebP and stored in Cloudflare R2, metadata lives in Supabase Postgres, and an admin console
(hidden, password + 2FA) handles review and tag control. The public reader site is not built yet.

## How it works

```
sources ──► ingest ──► safety gate ──► dedupe ──► fetch + convert ──► R2 + Postgres ──► admin review ──► publish
```

| Source | Kind | Notes |
|---|---|---|
| MangaDex | API | most-followed first, then the whole backlog (keyset pagination, no 10k cap) |
| Hitomi | index files | all languages, popularity order, resumable |
| Hentai2Read | HTML | popular and newest |
| HentaiFox, HentaiEra, AsmHentai, nhentai.xxx | HTML, one shared adapter | newest, and popular where the site has it |

* **Safety gate** (`src/lib/safety`): every work is classified before anything is downloaded.
  Works the source itself tags as sexual content involving minors are never downloaded or published: only
  an id, title and the matching tags are recorded. The core terms live in `core.ts` and are enforced from code.
  Everything else that is flagged is held as a draft for an admin (`/console` → Review queue); explicit
  age markers are held *without* downloading until an admin approves.
* **Dedupe** (`src/lib/dedupe.ts`): the same release from two sources is attached as an extra source of one work
  instead of being stored twice. Near-matches go to an admin; the daily job merges the clear ones.
* **Page data** is stored compactly per chapter (`pageData`), not one row per page, so the database stays small.

## Setup

```bash
npm install
cp .env.example .env      # fill it in (see the comments there)
npx prisma db push
npm run db:setup          # indexes + default safety terms
npm run dev
```

First admin: open `/console?k=<ADMIN_ENTRY_TOKEN>`, then `/console/setup` with `ADMIN_BOOTSTRAP_SECRET`,
enrol an authenticator app, then delete the bootstrap secret.

## Commands

| | |
|---|---|
| `npm run ingest -- --source=<mangadex\|hitomi\|hentai2read\|hentaifox\|hentaiera\|asmhentai\|nhentaixxx> --mode=popular\|recent\|retry\|backlog --limit=N --langs=en,ja [--dry-run]` | pull works |
| `npm run review -- list\|approve\|reject\|suppressed` | review queue from the terminal |
| `npm run dedupe` | merge cross-source duplicates |
| `npm run rescan` | re-check stored works against the current safety terms |
| `npm run verify` / `recompute` / `cleanup` / `health` | integrity, derived numbers, retention, dependency check |
| `npm run indexnow` / `-- --since=48h` / `-- --all` | tell Bing, Yandex and others about new works (the ingest workflows run it); needs `NEXT_PUBLIC_SITE_URL` to be the real https address |
| `npm run seo` | crawler-style SEO audit of a running site (head tags, indexing rules, structured data, sitemaps, robots, icons, share cards); build with `NEXT_PUBLIC_SITE_URL` equal to `BASE_URL` first |
| `npm run backfill-thumbs` | create the 280px card thumbnail for covers stored before thumbnails existed (new ingests do it automatically) |
| `npm test` / `npm run typecheck` | 74 unit tests / type-check of `src` and `scripts` |
| `npm run qa` / `npm run flows` | Playwright sweeps against a running server (`QA_BASE=http://localhost:3000`): layout, overflow, console and axe accessibility over every page and viewport / 81 behaviour checks (age gate, search, filters, library, reader) |

## Frontend

Next.js App Router, Tailwind with CSS-variable themes (dark default, light), mobile-first with a bottom nav on phones.
Browse, tag/artist/group/parody/character directories, nhentai-style search syntax (`tag:"x"`, `-tag:x`, `pages:>20`, `uploaded:<7d`; see `/search/help`),
language and hidden-tag preferences (cookies, applied server-side), local favorites and history, and a reader that works like a book: swipe (or drag, tap an edge, use the wheel or arrow keys) to turn pages with the page following your finger, two-page spreads on wide screens with the cover on its own, left-to-right or right-to-left, pinch / double-tap / `Z` to zoom, and resume where you left off. Tall webtoon strips fall back to a scroll automatically (Reader settings: Auto / Book / Scroll).
An age gate covers the whole site until confirmed. The legal pages under `src/app/(site)/(legal)` are draft text: have them reviewed before launch.

## SEO

All of it lives in `src/lib/seo.ts` (pure, unit-tested) and is checked end to end by `npm run seo`.

* **Set `NEXT_PUBLIC_SITE_URL`** to the real domain in Vercel (and as a GitHub secret). Canonical tags, sitemaps, structured data and share links all come from it; without it they fall back to the `*.vercel.app` address.
* Only the production deployment is indexed: previews send `noindex` and a `Disallow: /` robots.txt.
* Every page has its own title, description, canonical and share card. Work pages get a generated 1200x630 card (cover, title, tags; Japanese titles included), hreflang links between translations, and Book / ComicSeries + BreadcrumbList data. Lists carry ItemList data.
* Lists: page N is its own canonical and indexed up to page 5; sorted, filtered, searched and A-Z variants are `noindex, follow` and point back at the plain list. Tags, artists and circles with fewer than two works are noindex and left out of the sitemap.
* `/sitemap.xml` is an index of `/sitemap/<id>.xml` (main pages, tags, works with cover images). `robots.txt` blocks only the API, search results, `/random` and per-visitor pages; the reader is crawlable but `noindex`.
* Works merged by dedupe keep working: the old address 301s to the survivor (`RedirectMap`).
* IndexNow pings (key file in `public/`) go out when an admin publishes a work and after every ingest run.
* Optional: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION` add the ownership meta tags. RSS at `/feed.xml`, OpenSearch at `/opensearch.xml`.

After launch: add the site to Google Search Console and Bing Webmaster Tools. Submit `/sitemap-flat.xml` to Google (one file, crawled sooner on a new domain; LustHentai saw the same) and `/sitemap.xml` to Bing, and run `npm run indexnow -- --all` once.

## Workflows (`.github/workflows`)

`ingest*.yml` run each source on a schedule (newest, a never-ending popularity sweep, and a retry pass).
`maintenance.yml` runs daily: health, verify, rescan, dedupe, recompute, cleanup. `ci.yml` type-checks, tests and builds.
Logs are public, so ingest logs print counts and `#number` references only, never titles or source ids.

## Notes

* GitHub disables scheduled workflows after 60 days without repository activity.
* Storage grows without bound while the sweeps run (about 280 KB per page). Watch the R2 bill.
