// A preview deployment has its own address and must never appear in search results (it duplicates the real site).
const NOT_PRODUCTION = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";

// The project also answers on its *.vercel.app address. That is a second copy of the whole site (indexable, and running the ad
// code on an address the ad network has never approved), so on the production build every such request is sent to the real
// domain. Previews are left alone: they are behind Vercel's login and are how changes get checked.
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
const SEND_TO_REAL_DOMAIN = process.env.VERCEL_ENV === "production" && /^https:\/\/[^/]+$/.test(SITE) && !SITE.endsWith(".vercel.app");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev and production can run side by side (QA) without trampling each other's build output
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: process.env.NEXT_PUBLIC_IMG_CDN_HOST ?? "img-cdn.lustpages.com" }],
  },
  async redirects() {
    return SEND_TO_REAL_DOMAIN ? [{ source: "/:path*", has: [{ type: "host", value: ".*\\.vercel\\.app" }], destination: `${SITE}/:path*`, permanent: true }] : [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          ...(NOT_PRODUCTION ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
