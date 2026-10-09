import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { PREFS_COOKIE, parsePrefs, remapHidden, type HiddenTag, type Prefs } from "@/lib/prefs";
import { slug } from "@/lib/tags";

/**
 * A hidden tag is remembered by its id, in the visitor's cookie. When two spellings of one tag are merged ("Blow job"
 * into "blowjob") the removed one's id no longer exists, and filtering by it would silently stop hiding anything. The
 * merge leaves an alias behind (same type, old slug -> surviving tag), and the cookie also keeps the tag's name, so a
 * dead id is swapped for the survivor's. Tags that still exist are left alone.
 */
export async function resolveHidden(hide: HiddenTag[]): Promise<HiddenTag[]> {
  if (!hide.length) return hide;
  try {
    const alive = new Set((await prisma.tag.findMany({ where: { id: { in: hide.map((h) => h.id) } }, select: { id: true } })).map((t) => t.id));
    const dead = hide.filter((h) => !alive.has(h.id));
    if (!dead.length) return hide;
    const aliases = await prisma.tagAlias.findMany({ where: { slug: { in: dead.map((h) => slug(h.name)) } }, select: { slug: true, targetTagId: true } });
    const target = new Map(aliases.map((a) => [a.slug, a.targetTagId]));
    return remapHidden(hide, alive, target, slug);
  } catch {
    return hide; // the database is unreachable: better the visitor's own list as it is than none
  }
}

/** Parse the prefs cookie and bring its hidden-tag ids up to date. */
export async function prefsFromCookie(raw: string | undefined | null): Promise<Prefs> {
  const prefs = parsePrefs(raw);
  return prefs.hide.length ? { ...prefs, hide: await resolveHidden(prefs.hide) } : prefs;
}

/** The visitor's saved language / hidden-tag choices, read from the cookie. */
export async function currentPrefs(): Promise<Prefs> {
  return prefsFromCookie((await cookies()).get(PREFS_COOKIE)?.value);
}
