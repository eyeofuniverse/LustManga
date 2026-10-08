const HOST = process.env.NEXT_PUBLIC_IMG_CDN_HOST ?? "img-cdn.lustpages.com";
export const cdn = (key: string | null | undefined) => (key ? `https://${HOST}/${key}` : null);

/** 280px-wide cover for cards. Falls back to the full cover where the small one has not been generated yet. */
export const thumbUrl = (key: string | null | undefined) => (key ? cdn(key.replace(/\.webp$/, "-s.webp")) : null);
