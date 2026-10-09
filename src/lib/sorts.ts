/**
 * The ways a list of works can be ordered. Pure (no database), so the filter bar, the URL parser and the query
 * builder all read the same list.
 *   popular   all-time: imported popularity + views + saves
 *   trending  views in the last 2 days     week   in the last 7 days     month   in the last 30 days
 *   rated     best rated on the source sites (needs enough votes)
 *   saved     most saved by visitors       new    newest first
 *
 * Popular, Trending and Top rated are driven by what the SOURCE sites report (their views, followers, ratings and
 * popular charts, refreshed by `npm run signals`); this site's own readers add to them as they arrive.
 */
export type Sort = "popular" | "trending" | "week" | "month" | "rated" | "saved" | "new";

export const SORT_OPTIONS: { value: Sort; label: string; hint: string }[] = [
  { value: "popular", label: "Popular", hint: "Most popular of all time, from readers on the source sites and here" },
  { value: "trending", label: "Trending", hint: "Climbing the charts today" },
  { value: "week", label: "This week", hint: "Climbing the charts this week" },
  { value: "month", label: "This month", hint: "Climbing the charts this month" },
  { value: "rated", label: "Top rated", hint: "Best rated by readers (needs enough votes)" },
  { value: "saved", label: "Most saved", hint: "Saved by the most readers here" },
  { value: "new", label: "Newest", hint: "Most recently added" },
];

const VALID = new Set<string>(SORT_OPTIONS.map((s) => s.value));

/** The sort named in a URL, or the default (popular). */
export const parseSort = (v: string | undefined): Sort => (v && VALID.has(v) ? (v as Sort) : "popular");

/** "?sort=" is only written for the non-default sorts, so the default list keeps its plain URL. */
export const sortParam = (s: Sort): string | undefined => (s === "popular" ? undefined : s);
