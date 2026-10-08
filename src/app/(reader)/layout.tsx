import { cookies } from "next/headers";
import { AGE_COOKIE, PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { PrefsProvider } from "@/components/site/PrefsProvider";
import { AgeGate } from "@/components/site/AgeGate";

export const dynamic = "force-dynamic";

/** The reader has no site chrome: just the pages. A visitor who lands here directly still sees the age gate first. */
export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const ageOk = jar.get(AGE_COOKIE)?.value === "1";
  const prefs = parsePrefs(jar.get(PREFS_COOKIE)?.value);
  return (
    <PrefsProvider initial={prefs}>
      <div id="site-content" data-gated={!ageOk} inert={!ageOk}>
        {children}
      </div>
      {!ageOk && <AgeGate initialLangs={prefs.langs} />}
    </PrefsProvider>
  );
}
