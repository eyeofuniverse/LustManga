// A preview deployment has its own address and must never appear in search results (it duplicates the real site).
const NOT_PRODUCTION = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev and production can run side by side (QA) without trampling each other's build output
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: process.env.NEXT_PUBLIC_IMG_CDN_HOST ?? "img-cdn.lustpages.com" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
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
