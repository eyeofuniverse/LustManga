import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { IS_PRODUCTION, RTA_LABEL, SITE_NAME, SITE_URL } from "@/lib/site";
import { HOME_DESCRIPTION, HOME_TITLE, socialMeta } from "@/lib/seo";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s | ${SITE_NAME}` },
  description: HOME_DESCRIPTION,
  applicationName: SITE_NAME,
  // only the production site is indexed; a preview deployment is a duplicate under another address
  robots: IS_PRODUCTION
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } }
    : { index: false, follow: false },
  ...socialMeta({ title: HOME_TITLE, description: HOME_DESCRIPTION }),
  // Search Console / Bing Webmaster ownership, only when configured
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : undefined,
  },
  // parental-control software looks for this label
  other: { rating: RTA_LABEL },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b10",
};

// Applies the saved theme before first paint so there is no flash. Dark unless the visitor chose light.
const themeScript = `(function(){try{var t=localStorage.getItem('lm:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${sora.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* a page that sets its own metadata.alternates replaces the layout one, so the feed link is written here */}
        <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME}: new manga & doujinshi`} href="/feed.xml" />
        <link rel="search" type="application/opensearchdescription+xml" title={SITE_NAME} href="/opensearch.xml" />
        {/* covers are the largest element on most pages: open the connection to the image host early */}
        <link rel="preconnect" href={`https://${process.env.NEXT_PUBLIC_IMG_CDN_HOST ?? "img-cdn.lustpages.com"}`} crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
