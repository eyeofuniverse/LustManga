const HOST = process.env.NEXT_PUBLIC_IMG_CDN_HOST ?? "img-cdn.lustpages.com";
export const cdn = (key: string | null | undefined) => (key ? `https://${HOST}/${key}` : null);
