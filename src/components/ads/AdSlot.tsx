import { serveAd, type ServedAd } from "@/lib/ads/serve";
import { AdBox } from "./AdBox";

/** One chosen ad, rendered. A banner is plain server HTML; an ad network's code is run by <AdBox> in the browser. */
export function AdView({ ad, className = "", contained = false }: { ad: ServedAd; className?: string; contained?: boolean }) {
  const banner = ad.type === "banner" && ad.imageUrl && ad.linkUrl;
  if (ad.type === "banner" && !banner) return null;
  if (ad.type === "code" && !ad.code) return null;
  return (
    <div className={`${contained ? "container-x " : ""}${className}`}>
      <AdBox ad={{ id: ad.id, slot: ad.slot, type: ad.type, code: ad.code, isolation: ad.isolation, width: ad.width, height: ad.height }}>
        {banner && (
          // the click goes through /go/ad/<id> so it is counted; "sponsored" and "nofollow" tell search engines this is paid
          <a href={`/go/ad/${ad.id}`} target="_blank" rel="sponsored nofollow noopener" className="block overflow-hidden rounded-xl ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ad.imageUrl!} alt={ad.alt ?? "Advertisement"} width={ad.width ?? undefined} height={ad.height ?? undefined} loading="lazy" decoding="async" className="mx-auto block h-auto max-w-full" />
          </a>
        )}
      </AdBox>
    </div>
  );
}

/**
 * A place in a page where an ad may appear (the places are listed in src/lib/ads/registry.ts, the ads are managed in the
 * console under Ads). Renders nothing at all when there is no ad to show, so an empty slot costs no space: the spacing around
 * the ad (`className`) belongs to the ad, not to the page. `contained` gives it the page's content width and side padding.
 */
export async function AdSlot({ slot, className = "", contained = false }: { slot: string; className?: string; contained?: boolean }) {
  const ad = await serveAd(slot);
  return ad ? <AdView ad={ad} className={className} contained={contained} /> : null;
}
