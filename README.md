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
| `npm run backfill-thumbs` | create the 280px card thumbnail for covers stored before thumbnails existed (new ingests do it automatically) |
| `npm test` / `npm run typecheck` | 66 unit tests / type-check of `src` and `scripts` |
| `npm run qa` / `npm run flows` | Playwright sweeps against a running server (`QA_BASE=http://localhost:3000`): layout, overflow, console and axe accessibility over every page and viewport / 48 behaviour checks (age gate, search, filters, library, reader) |

## Frontend

Next.js App Router, Tailwind with CSS-variable themes (dark default, light), mobile-first with a bottom nav on phones.
Browse, tag/artist/group/parody/character directories, nhentai-style search syntax (`tag:"x"`, `-tag:x`, `pages:>20`, `uploaded:<7d`; see `/search/help`),
language and hidden-tag preferences (cookies, applied server-side), local favorites and history, and a reader with scroll and paged modes, LTR/RTL, tap zones, swipe, keyboard, and resume.
An age gate covers the whole site until confirmed. The legal pages under `src/app/(site)/(legal)` are draft text: have them reviewed before launch.

## Workflows (`.github/workflows`)

`ingest*.yml` run each source on a schedule (newest, a never-ending popularity sweep, and a retry pass).
`maintenance.yml` runs daily: health, verify, rescan, dedupe, recompute, cleanup. `ci.yml` type-checks, tests and builds.
Logs are public, so ingest logs print counts and `#number` references only, never titles or source ids.

## Notes

* GitHub disables scheduled workflows after 60 days without repository activity.
* Storage grows without bound while the sweeps run (about 280 KB per page). Watch the R2 bill.
