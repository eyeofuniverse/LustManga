/**
 * Where a visitor came from, reduced to a host and a kind. Only the host is kept: a full referrer URL can carry a search
 * query or a private page address.
 */
export type RefKind = "direct" | "search" | "social" | "referral";

const SEARCH = /(^|\.)(google\.[a-z.]+|googlequicksearchbox|bing\.com|duckduckgo\.com|yahoo\.[a-z.]+|yandex\.[a-z.]+|ya\.ru|baidu\.com|ecosia\.org|brave\.com|startpage\.com|naver\.com|seznam\.cz|qwant\.com|sogou\.com|kagi\.com|search\.[a-z.]+|ask\.com|aol\.com|dogpile\.com|mojeek\.com)$/i;
const SOCIAL = /(^|\.)(reddit\.com|redd\.it|facebook\.com|fb\.com|fb\.me|instagram\.com|twitter\.com|x\.com|t\.co|t\.me|telegram\.(org|me)|tumblr\.com|pinterest\.[a-z.]+|pin\.it|discord\.(com|gg)|tiktok\.com|youtube\.com|youtu\.be|vk\.com|weibo\.com|line\.me|whatsapp\.com|bsky\.app|threads\.net|mastodon\.[a-z.]+|lemmy\.[a-z.]+)$/i;

export interface Referrer {
  host: string | null;
  kind: RefKind;
}

/**
 * @param referrer  document.referrer of the first page of a visit (may be empty, or an android-app:// address)
 * @param own       hosts that are this site; arriving from them is not a referral
 */
export function classifyReferrer(referrer: unknown, own: string[]): Referrer {
  if (typeof referrer !== "string" || !referrer || referrer.length > 600) return { host: null, kind: "direct" };
  let host: string;
  try {
    const u = new URL(referrer);
    if (u.protocol === "android-app:") host = u.hostname.toLowerCase();
    else if (u.protocol === "http:" || u.protocol === "https:") host = u.hostname.toLowerCase();
    else return { host: null, kind: "direct" };
  } catch {
    return { host: null, kind: "direct" };
  }
  host = host.replace(/^(www|m|l|lm|out|mobile)\./, "");
  if (!host || host.length > 100 || !/^[a-z0-9.-]+$/.test(host)) return { host: null, kind: "direct" };
  const mine = own.map((h) => h.toLowerCase().replace(/^www\./, "")).filter(Boolean);
  if (mine.some((h) => host === h || host.endsWith(`.${h}`))) return { host: null, kind: "direct" };
  if (SEARCH.test(host)) return { host, kind: "search" };
  if (SOCIAL.test(host)) return { host, kind: "social" };
  return { host, kind: "referral" };
}

/** A campaign tag in the URL (?utm_source=...) is plain text the sender chose; keep it short and tame. */
export function cleanTag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().toLowerCase().slice(0, 60);
  return s || null;
}
