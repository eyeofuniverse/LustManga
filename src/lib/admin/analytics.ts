import "server-only";
import { unstable_cache } from "next/cache";
import { guardConsole } from "@/lib/admin/guard";
import { content, healthReport, overview, search } from "@/lib/analytics/queries";
import { parseRange, type Range } from "@/lib/analytics/ranges";
import { parseTab, type AnalyticsData, type AnalyticsTab } from "@/lib/analytics/types";

/**
 * Each screen is computed at most once a minute however many admins look at it: the queries read the whole range from the
 * database, and the numbers do not need to be live to the second. The sign-in check runs BEFORE the cache, on every request.
 */
const build = unstable_cache(
  async (tab: AnalyticsTab, range: Range): Promise<AnalyticsData> => {
    switch (tab) {
      case "content":
        return { tab, d: await content(range) };
      case "search":
        return { tab, d: await search(range) };
      case "health":
        return { tab, d: await healthReport(range) };
      default:
        return { tab: "overview", d: await overview(range) };
    }
  },
  ["console-analytics-v1"],
  { revalidate: 60, tags: ["console-analytics"] },
);

export async function loadAnalytics(tabRaw: unknown, rangeRaw: unknown): Promise<AnalyticsData & { range: Range }> {
  await guardConsole();
  const range = parseRange(rangeRaw);
  return { ...(await build(parseTab(tabRaw), range)), range };
}
