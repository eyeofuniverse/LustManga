/**
 * Where ads may appear. The positions are fixed here, in code, because each one is a place in a page's layout that was
 * chosen not to push the main actions (Read, Save, the grid itself) out of reach. Which ads fill them is managed in the
 * console (Ads). A slot with no ad renders nothing at all: no empty box, no shifted layout.
 *
 * Sizes are the ones ExoClick offers for its Banner (desktop) and Mobile Banner zones: 728x90, 300x250 and 900x250 on computers,
 * 300x100 and 300x250 on phones. Each slot has one size per device band; a slot that has no position on a
 * device (`null`) never serves there.
 */
export type Device = "desktop" | "mobile";
export type Band = "all" | Device;
export type Revenue = "top" | "strong" | "steady";
export type SlotGroup = "Home" | "Lists" | "Search" | "Work page" | "Reader" | "Site-wide";

export interface Size {
  w: number;
  h: number;
}

export interface SlotDef {
  key: string;
  label: string;
  group: SlotGroup;
  /** where it sits on the page, in plain words */
  where: string;
  /** a pop-under is a script, not a box */
  kind: "banner" | "popunder";
  desktop: Size | null;
  mobile: Size | null;
  revenue: Revenue;
  /** what works well here, shown to the admin */
  tip: string;
}

const S = (w: number, h: number): Size => ({ w, h });

export const SLOTS: SlotDef[] = [
  {
    key: "home-top",
    label: "Home: under the spotlight",
    group: "Home",
    where: "Between the spotlight work and the first row, at the top of the home page",
    kind: "banner",
    desktop: S(728, 90),
    mobile: S(300, 100),
    revenue: "strong",
    tip: "The first thing after the spotlight on the busiest page. A leaderboard (728x90) on desktop and a 300x100 on phones sit cleanly under it.",
  },
  {
    key: "home-mid",
    label: "Home: between sections",
    group: "Home",
    where: "Between the new uploads and the category tiles",
    kind: "banner",
    desktop: S(728, 90),
    mobile: S(300, 250),
    revenue: "strong",
    tip: "A natural pause after a visitor has scanned the new uploads. Native or a 300x250 fits best.",
  },
  {
    key: "home-footer",
    label: "Home: end of page",
    group: "Home",
    where: "At the bottom of the home page, above the footer",
    kind: "banner",
    desktop: S(900, 250),
    mobile: S(300, 100),
    revenue: "steady",
    tip: "Reached only by visitors who scroll the whole page: good for a lower-priority or backup ad.",
  },
  {
    key: "list-top",
    label: "Lists: above the grid",
    group: "Lists",
    where: "Above the works on Browse, tag, artist, circle, parody, character and language pages, and New uploads",
    kind: "banner",
    desktop: S(728, 90),
    mobile: S(300, 100),
    revenue: "strong",
    tip: "A high-intent moment: the visitor is choosing what to read. One slot covers every list page.",
  },
  {
    key: "list-in-grid",
    label: "Lists: inside the grid",
    group: "Lists",
    where: "A full-width break after the 12th work in the same pages as above",
    kind: "banner",
    desktop: S(728, 90),
    mobile: S(300, 250),
    revenue: "top",
    tip: "Sits among the covers while the visitor is scrolling through choices, so it is seen more than a header or footer ad. Native works especially well here.",
  },
  {
    key: "list-footer",
    label: "Lists: below the grid",
    group: "Lists",
    where: "Under the works and the page numbers",
    kind: "banner",
    desktop: S(900, 250),
    mobile: S(300, 100),
    revenue: "steady",
    tip: "For visitors who reach the end of a page before choosing: a steady fill.",
  },
  {
    key: "search-top",
    label: "Search: above the results",
    group: "Search",
    where: "Above the works found by a search",
    kind: "banner",
    desktop: S(728, 90),
    mobile: S(300, 100),
    revenue: "strong",
    tip: "Searchers know what they want. Native, styled like a result, usually draws the most clicks.",
  },
  {
    key: "work-mid",
    label: "Work page: before the description",
    group: "Work page",
    where: "Under the tags, above the description, beside the cover on desktop",
    kind: "banner",
    desktop: S(300, 250),
    mobile: S(300, 250),
    revenue: "strong",
    tip: "Seen by most visitors, below the Read and Save buttons so they stay in reach. A 300x250 fits the column.",
  },
  {
    key: "work-footer",
    label: "Work page: below the chapters",
    group: "Work page",
    where: "After the chapter list, before the related works",
    kind: "banner",
    desktop: S(900, 250),
    mobile: S(300, 100),
    revenue: "steady",
    tip: "A break between the work and the suggestions.",
  },
  {
    key: "reader-mid",
    label: "Reader: between pages",
    group: "Reader",
    where: "Between pages while reading: after every 15 pages (every 30 in a work of 100 pages or more), in book and scroll mode",
    kind: "banner",
    desktop: S(300, 250),
    mobile: S(300, 250),
    revenue: "strong",
    tip: "Shown for looking at only: it cannot be clicked, so a tap meant for a page never opens an ad (and earns on views, not clicks). There is a Continue button in the book. A place that stays empty is left out, and a reader whose browser keeps showing nothing (two in a row) is not given more.",
  },
  {
    key: "reader-end",
    label: "Reader: end of chapter",
    group: "Reader",
    where: "On the card shown after the last page of a chapter",
    kind: "banner",
    desktop: S(300, 250),
    mobile: S(300, 250),
    revenue: "top",
    tip: "The visitor has just finished reading and is deciding what next. Unlike the ads between pages, this one can be clicked.",
  },
  {
    key: "global-popunder",
    label: "Site-wide: pop-under",
    group: "Site-wide",
    where: "A script that opens an ad behind the page on a visitor's first click (every public page except the reader, where a tap turns a page; never the console)",
    kind: "popunder",
    desktop: null,
    mobile: null,
    revenue: "top",
    tip: "Paste the network's pop-under zone script as an Ad code ad. Set how often it opens (the frequency limit) in the network's zone settings and in the script's own options; this site only loads the script, once per page, after the visitor has confirmed they are an adult. The count shown for it is script loads: whether a window actually opens is the network's decision.",
  },
];

const BY_KEY = new Map(SLOTS.map((s) => [s.key, s]));
export const SLOT_KEYS = SLOTS.map((s) => s.key);
export const slotDef = (key: string): SlotDef | null => BY_KEY.get(key) ?? null;

export const REVENUE_LABEL: Record<Revenue, string> = { top: "Top earner", strong: "Strong", steady: "Steady" };

/** The device bands an ad for this slot may target. */
export function bandsFor(def: SlotDef): Band[] {
  const out: Band[] = ["all"];
  if (def.kind === "popunder" || def.desktop) out.push("desktop");
  if (def.kind === "popunder" || def.mobile) out.push("mobile");
  return out;
}

/** Does the slot exist on this device at all? */
export function onDevice(def: SlotDef, device: Device): boolean {
  return def.kind === "popunder" ? true : device === "desktop" ? def.desktop !== null : def.mobile !== null;
}

/** The size an ad gets when the admin has not set one: the slot's own size for the viewer's device. */
export function defaultSize(def: SlotDef, device: Device): Size | null {
  return (device === "desktop" ? def.desktop : def.mobile) ?? def.desktop ?? def.mobile;
}

/** Tablets get the desktop sizes. */
export const bandOfDevice = (d: "mobile" | "tablet" | "desktop"): Device => (d === "mobile" ? "mobile" : "desktop");
