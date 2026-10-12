/**
 * Where to send a visitor after signing in: a path on this site and nothing else. An absolute address, a protocol-relative
 * one ("//evil.example"), a backslash trick, or a path into the API, the console or an account screen all fall back.
 */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next) return fallback;
  if (next.length > 300 || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001F\u007F]/.test(next)) return fallback;
  if (/^\/(api|console|login|signup|forgot|go)(\/|\?|#|$)/i.test(next)) return fallback;
  return next;
}
