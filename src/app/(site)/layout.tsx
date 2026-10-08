import { cookies } from "next/headers";
import { AGE_COOKIE, PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { PrefsProvider } from "@/components/site/PrefsProvider";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { BottomNav } from "@/components/site/BottomNav";
import { AgeGate } from "@/components/site/AgeGate";
import { NavProgress } from "@/components/site/NavProgress";

// Everything here depends on the visitor's cookies (language, hidden tags), so it is rendered per request.
export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const ageOk = jar.get(AGE_COOKIE)?.value === "1";
  const prefs = parsePrefs(jar.get(PREFS_COOKIE)?.value);

  return (
    <PrefsProvider initial={prefs}>
      <NavProgress />
      <div id="site-content" data-gated={!ageOk} className="flex min-h-dvh flex-col" inert={!ageOk}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        <main id="main" className="flex-1 pb-28 md:pb-16">
          {children}
        </main>
        <Footer />
        <BottomNav />
      </div>
      {!ageOk && <AgeGate initialLangs={prefs.langs} />}
    </PrefsProvider>
  );
}
