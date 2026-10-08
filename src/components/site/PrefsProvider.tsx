"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PREFS_COOKIE, serializePrefs, type HiddenTag, type Prefs } from "@/lib/prefs";

interface PrefsApi {
  prefs: Prefs;
  setLangs: (langs: string[]) => void;
  toggleLang: (code: string) => void;
  hideTag: (tag: HiddenTag) => void;
  unhideTag: (id: number) => void;
}

const Ctx = createContext<PrefsApi | null>(null);

/** Holds the visitor's language / hidden-tag choices. Saving writes the cookie the server reads, then refreshes the page data. */
export function PrefsProvider({ initial, children }: { initial: Prefs; children: React.ReactNode }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(initial);

  const save = useCallback(
    (next: Prefs) => {
      setPrefs(next);
      document.cookie = `${PREFS_COOKIE}=${serializePrefs(next)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    },
    [router],
  );

  const api = useMemo<PrefsApi>(
    () => ({
      prefs,
      setLangs: (langs) => save({ ...prefs, langs }),
      toggleLang: (code) =>
        save({ ...prefs, langs: prefs.langs.includes(code) ? prefs.langs.filter((l) => l !== code) : [...prefs.langs, code] }),
      hideTag: (tag) => (prefs.hide.some((h) => h.id === tag.id) ? undefined : save({ ...prefs, hide: [...prefs.hide, tag] })),
      unhideTag: (id) => save({ ...prefs, hide: prefs.hide.filter((h) => h.id !== id) }),
    }),
    [prefs, save],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePrefs must be used inside PrefsProvider");
  return v;
}
