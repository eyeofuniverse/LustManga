import type { Band, Revenue, SlotGroup } from "./registry";
import type { AdStatus } from "./select";
import type { Range } from "@/lib/analytics/ranges";

/** What the console shows about advertising. Plain data (dates as ISO strings): safe to cache and to pass to client components. */
export interface AdRow {
  id: string;
  slot: string;
  name: string;
  type: "code" | "banner";
  device: Band;
  code: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  isolation: "inline" | "frame";
  priority: number;
  weight: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  /** changes on every save: a form keyed on it remounts with the saved values */
  updatedAt: string;
  status: AdStatus;
  /** in the chosen range */
  impressions: number;
  clicks: number;
  /** since the ad was created */
  impressionsAll: number;
  clicksAll: number;
}

export interface SlotSummary {
  key: string;
  label: string;
  group: SlotGroup;
  where: string;
  kind: "banner" | "popunder";
  revenue: Revenue;
  bands: Band[];
  ads: Record<AdStatus, number>;
  impressions: number;
  clicks: number;
}

export interface AdsOverview {
  range: Range;
  /** the "Show ads" switch in the console */
  enabled: boolean;
  /** ADS=off in the environment: stronger than the switch */
  envOff: boolean;
  totals: { impressions: number; clicks: number; liveAds: number; slotsLive: number };
  series: { day: string; n: number }[];
  slots: SlotSummary[];
  asOf: string;
}

export interface SlotPage {
  range: Range;
  enabled: boolean;
  envOff: boolean;
  slot: Omit<SlotSummary, "ads" | "impressions" | "clicks"> & { desktop: { w: number; h: number } | null; mobile: { w: number; h: number } | null; tip: string };
  ads: AdRow[];
  asOf: string;
}
