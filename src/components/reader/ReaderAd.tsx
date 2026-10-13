"use client";

import { ChevronRight } from "lucide-react";
import { AdBox } from "@/components/ads/AdBox";

/** What the reader needs to show one ad: plain data, chosen by the server for this visitor. There is no link: nothing here is clickable. */
export interface ReaderAdData {
  id: string;
  slot: string;
  type: "code" | "banner";
  code: string | null;
  imageUrl: string | null;
  alt: string | null;
  isolation: "inline" | "frame";
  width: number | null;
  height: number | null;
}

/**
 * An ad between pages. It is for looking at, not for pressing: a tap meant for the page (to turn it, or to bring the bars back)
 * must never open an advertiser, so the ad is "passive" (see AdBox): it cannot be clicked, tabbed to or focused, and a tap on it
 * goes to the reader behind it, which treats it like a tap on the page.
 *
 * In the book there is a button to carry on, so nobody is ever unsure how to leave the slide.
 */
export function ReaderAd({ ad, eager = false, onState, onContinue }: { ad: ReaderAdData; eager?: boolean; onState?: (s: "filled" | "empty") => void; onContinue?: () => void }) {
  const banner = ad.type === "banner" && ad.imageUrl;
  return (
    <div className="flex flex-col items-center gap-4 px-4" data-reader-ad={ad.id}>
      <AdBox ad={ad} passive eager={eager} giveUpMs={5000} onState={onState} className="text-white/50">
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.imageUrl!} alt={ad.alt ?? "Advertisement"} width={ad.width ?? undefined} height={ad.height ?? undefined} draggable={false} className="mx-auto block h-auto max-w-full rounded-lg" />
        )}
      </AdBox>
      {onContinue && (
        <button type="button" onClick={onContinue} className="btn-soft h-11 px-6 !bg-white/10 !text-white hover:!bg-white/15">
          Continue reading <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
