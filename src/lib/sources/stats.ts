/**
 * The counters a source shows on a work's own page: how many people saved it, how many liked or rated it, how many
 * viewed it, and when it was published. Pure parsers over page HTML, so they are tested against real markup.
 */
export interface SourceStats {
  /** people who saved / bookmarked / favourited it */
  favorites?: number;
  views?: number;
  /** average rating, 0-10 */
  rating?: number | null;
  /** how many votes the rating rests on */
  votes?: number;
  /** when the source says it was published */
  publishedAt?: Date;
}

/** Page HTML as one line of plain text. */
const toText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

const n = (s: string | undefined) => (s ? Number(s.replace(/[^\d]/g, "")) || 0 : undefined);

const UNIT_MS: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };

/** "9 hours ago", "a day ago", "2 weeks ago", "yesterday", "just now" as a date. Months and years are approximate. */
export function parseAgo(text: string, now = Date.now()): Date | undefined {
  const t = text.trim().toLowerCase();
  if (/^(just now|moments? ago)$/.test(t)) return new Date(now);
  if (t === "yesterday") return new Date(now - UNIT_MS.day);
  const m = /^(an?|\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/.exec(t);
  if (!m) return undefined;
  const count = m[1].startsWith("a") ? 1 : Number(m[1]);
  return new Date(now - count * UNIT_MS[m[2]]);
}

/**
 * The nhentai-style clone sites (HentaiFox, HentaiEra, AsmHentai, nhentai.xxx): "Favorite ( 12 )" on all of them,
 * "Like ( 3 ) Dislike ( 1 )" on HentaiEra, and "Uploaded: 9 hours ago" / "Posted: 1 day ago" on two of them.
 */
export function parseImStats(html: string, now = Date.now()): SourceStats {
  const text = toText(html);
  const out: SourceStats = {};
  const fav = /Favou?rites?\s*\(\s*([\d,.]+)\s*\)/i.exec(text);
  if (fav) out.favorites = n(fav[1]);
  const likes = n(/\bLike\s*\(\s*([\d,.]+)\s*\)/.exec(text)?.[1]);
  const dislikes = n(/\bDislike\s*\(\s*([\d,.]+)\s*\)/.exec(text)?.[1]);
  if (likes !== undefined && dislikes !== undefined && likes + dislikes > 0) {
    out.votes = likes + dislikes;
    out.rating = (10 * likes) / (likes + dislikes);
  }
  const when = /(?:Uploaded|Posted)\s*:?\s*((?:an?|\d+)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|yesterday|just now)/i.exec(text);
  if (when) out.publishedAt = parseAgo(when[1], now);
  return out;
}

/** Hentai2Read: "(score 5/5 with 15014 votes)", "View 8,240 views", and "31547 Read List" (people who bookmarked it). */
export function parseH2rStats(html: string): SourceStats {
  const text = toText(html);
  const out: SourceStats = {};
  const score = /score\s*([\d.]+)\s*\/\s*5\s*with\s*([\d,]+)\s*votes/i.exec(text);
  if (score) {
    out.rating = Number(score[1]) * 2;
    out.votes = n(score[2]);
  }
  const views = /View\s*([\d,]+)\s*views/i.exec(text);
  if (views) out.views = n(views[1]);
  const list = /([\d,]+)\s*Read List/i.exec(text);
  if (list) out.favorites = n(list[1]);
  return out;
}
