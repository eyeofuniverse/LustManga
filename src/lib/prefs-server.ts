import "server-only";
import { cookies } from "next/headers";
import { PREFS_COOKIE, parsePrefs, type Prefs } from "@/lib/prefs";

/** The visitor's saved language / hidden-tag choices, read from the cookie. */
export async function currentPrefs(): Promise<Prefs> {
  return parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
}
