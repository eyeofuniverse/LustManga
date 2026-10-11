import { serveAd } from "@/lib/ads/serve";
import { PopUnder } from "./PopUnder";

/** Mounted once in each public layout: the pop-under script, if one is live for this visitor. */
export async function PopUnderSlot() {
  const ad = await serveAd("global-popunder");
  return ad?.code ? <PopUnder id={ad.id} code={ad.code} /> : null;
}
