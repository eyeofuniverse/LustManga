import type { Point, Range } from "./ranges";

/** What the console shows. Plain data (dates as ISO strings), safe to cross the server/client boundary and to cache. */
export interface Totals {
  pageviews: number;
  visitors: number;
  sessions: number;
  /** sessions that looked at one page only, as a percentage of sessions */
  bounceRate: number;
  pagesPerSession: number;
  /** average seconds a page was in use, over the page views that reported it */
  avgSeconds: number | null;
  /** page views that reported a time, as a percentage (how much to trust avgSeconds) */
  reportedPct: number;
}

export interface Row {
  label: string;
  value: number;
  /** a second number for the row (visitors, a rate...) */
  extra?: number | null;
  href?: string;
}

export interface TopWork {
  publicId: number;
  title: string;
  slug: string;
  coverKey: string | null;
  views: number;
  reads: number;
  finished: number;
  saves: number;
}

export interface Meta {
  range: Range;
  /** ISO time the numbers were computed */
  asOf: string;
  from: string;
  to: string;
  hourly: boolean;
}

export interface CollectorHealth {
  lastViewAt: string | null;
  viewsLastHour: number;
  oldestAt: string | null;
  rows: { views: number; events: number; vitals: number };
  retentionDays: number;
}

export interface OverviewData {
  meta: Meta;
  totals: Totals;
  previous: Totals;
  series: Point[];
  online: number;
  topPages: { path: string; kind: string; views: number; visitors: number; avgSeconds: number | null }[];
  entryPages: Row[];
  sources: Row[];
  referrers: Row[];
  campaigns: Row[];
  countries: Row[];
  devices: Row[];
  browsers: Row[];
  systems: Row[];
  languages: Row[];
  hours: { hour: number; views: number }[];
  health: CollectorHealth;
}

export interface ContentData {
  meta: Meta;
  works: TopWork[];
  topRead: TopWork[];
  funnel: { label: string; value: number }[];
  reading: { chapterOpens: number; readers: number; finishedRate: number; avgPagesRead: number | null; chaptersPerReader: number };
  actions: { saves: number; unsaves: number; follows: number; downloads: number; shares: number };
  tags: Row[];
  kinds: Row[];
}

export interface SearchData {
  meta: Meta;
  searches: number;
  searchers: number;
  zeroRate: number;
  top: { query: string; count: number; avgResults: number | null; zero: number }[];
  zero: { query: string; count: number }[];
}

export interface VitalSummary {
  metric: string;
  p75: number | null;
  samples: number;
  good: number;
  needs: number;
  poor: number;
}

export interface HealthData {
  meta: Meta;
  vitals: { all: VitalSummary[]; mobile: VitalSummary[]; desktop: VitalSummary[] };
  notFound: Row[];
  notFoundTotal: number;
  gate: { shown: number; passed: number; rate: number };
  health: CollectorHealth;
}

export type AnalyticsTab = "overview" | "content" | "search" | "health";
export const TABS: { id: AnalyticsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Content & reading" },
  { id: "search", label: "Search" },
  { id: "health", label: "Speed & health" },
];
export const parseTab = (v: unknown): AnalyticsTab => (TABS.some((t) => t.id === v) ? (v as AnalyticsTab) : "overview");

export type AnalyticsData =
  | { tab: "overview"; d: OverviewData }
  | { tab: "content"; d: ContentData }
  | { tab: "search"; d: SearchData }
  | { tab: "health"; d: HealthData };
