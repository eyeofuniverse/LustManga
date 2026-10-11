"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { optedOut } from "@/lib/analytics/client";

/**
 * Google Analytics 4, loaded only when NEXT_PUBLIC_GA_ID is set (a "G-XXXXXXXXXX" measurement id; it is public by design).
 * Nothing loads without it, so the site ships with no third-party tracker until the id is added.
 *
 * It is held back, and never loaded at all, for a visitor who sends Do Not Track or Global Privacy Control, for automated
 * browsers, and until the visitor has passed the 18+ gate (a visitor who leaves at the gate is not sent to Google).
 * The first page load is reported by gtag itself; pages opened inside the app are reported by GA4's own "page changes based on
 * browser history events" (Enhanced measurement, on by default), so nothing is sent by hand here, which would count them twice.
 * Cookies are only set by Google once it loads, and `anonymize_ip` is on. If you serve visitors in the EU/UK you need a
 * consent banner on top of this: Google Analytics cookies require consent there. The first-party statistics in the console
 * need neither, which is why they are the main analytics and this is an addition.
 */
const GA_ID = (process.env.NEXT_PUBLIC_GA_ID ?? "").trim();
const VALID = /^G-[A-Z0-9]{6,14}$/;

export function GoogleAnalytics({ enabled }: { enabled: boolean }) {
  const [go, setGo] = useState(false);

  // decided in the browser, after the gate: the server cannot know about Do Not Track or the visitor's age confirmation
  useEffect(() => {
    if (!enabled || !VALID.test(GA_ID) || optedOut()) return;
    const check = () => {
      const gated = document.getElementById("site-content")?.getAttribute("data-gated") === "true";
      if (!gated) setGo(true);
      return !gated;
    };
    if (check()) return;
    const t = setInterval(() => check() && clearInterval(t), 1000); // the gate closes without a page load
    return () => clearInterval(t);
  }, [enabled]);

  if (!go) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`}
      </Script>
    </>
  );
}
