import Link from "next/link";
import { Activity, AlertTriangle, ArrowUpRight, Clock, Eye, FileX, Gauge, Info, MousePointerClick, Search as SearchIcon, ShieldCheck, Users } from "lucide-react";
import type { AnalyticsData, CollectorHealth, ContentData, HealthData, OverviewData, Row, SearchData, TopWork, VitalSummary } from "@/lib/analytics/types";
import { TABS, type AnalyticsTab } from "@/lib/analytics/types";
import { RANGES, RANGE_LABEL, RANGE_VS, change, clock, pct, type Range } from "@/lib/analytics/ranges";
import { VITAL_INFO, formatVital, rate } from "@/lib/analytics/vitals";
import { RETENTION_DAYS } from "@/lib/analytics/config";
import { thumbUrl } from "@/lib/cdn";
import { workHref } from "@/lib/format";
import { ago } from "@/lib/admin/format";
import { Badge, BarList, Card, Cover, Empty, Note, PageHeader, SectionTitle, Split, Stat, Tabs, type Tone } from "../ui";
import { Delta, HourBars, Trend } from "../charts";

const href = (tab: AnalyticsTab, range: Range) => `/console/analytics?tab=${tab}&range=${range}`;
const n = (v: number) => v.toLocaleString();

const regions = new Intl.DisplayNames(["en"], { type: "region" });
const languages = new Intl.DisplayNames(["en"], { type: "language" });
const safe = (fn: () => string | undefined, fallback: string) => {
  try {
    return fn() || fallback;
  } catch {
    return fallback;
  }
};
const country = (code: string) => (/^[A-Z]{2}$/.test(code) ? safe(() => regions.of(code), code) : code);
const language = (code: string) => (/^[a-z]{2,3}$/.test(code) ? safe(() => languages.of(code), code) : code);
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function RangePicker({ tab, range }: { tab: AnalyticsTab; range: Range }) {
  return (
    <nav aria-label="Time range" className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
      {RANGES.map((r) => (
        <Link key={r} href={href(tab, r)} className="c-tab" aria-current={r === range ? "page" : undefined}>
          {r === "today" ? "Today" : r.replace("d", " days")}
        </Link>
      ))}
    </nav>
  );
}

/** Tracking that has gone quiet is the failure that nothing else will tell you about, so it is said out loud. */
function CollectorStrip({ h, asOf }: { h: CollectorHealth; asOf: string }) {
  const last = h.lastViewAt ? new Date(h.lastViewAt).getTime() : null;
  const quiet = last == null || Date.now() - last > 3_600_000;
  return (
    <div className="space-y-3">
      {quiet && (
        <Note tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
          <b className="text-text">{last == null ? "No page view has ever been recorded." : `The last page view was ${ago(h.lastViewAt)}.`}</b> If the site has visitors, check that
          the site address is set to the real https domain and that analytics is not switched off (<code className="rounded bg-surface-2 px-1">ANALYTICS=off</code>). Visitors who send
          &ldquo;Do Not Track&rdquo; or &ldquo;Global Privacy Control&rdquo;, and robots, are deliberately not counted.
        </Note>
      )}
      <p className="text-xs leading-relaxed text-muted">
        Last page view recorded <b className="text-text">{ago(h.lastViewAt)}</b> · {n(h.viewsLastHour)} in the last hour · {n(h.rows.views)} page views, {n(h.rows.events)} events and {n(h.rows.vitals)} speed
        samples stored{h.oldestAt ? ` since ${h.oldestAt.slice(0, 10)}` : ""} · raw rows are deleted after {h.retentionDays} days · numbers computed {ago(asOf)}.
      </p>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { home: "Home", browse: "Browse", work: "Work pages", read: "Reader", tag: "Tag / artist / category pages", search: "Search", list: "Tag lists", user: "Library & settings", static: "Legal & help", other: "Other / not found" };
const pageName = (path: string, kind: string) => (kind === "work" ? `Work #${path.split("/")[2]}` : kind === "read" ? `Reader · work #${path.split("/")[2]}` : path);

function Pages({ d }: { d: OverviewData }) {
  const max = Math.max(1, ...d.topPages.map((p) => p.views));
  return (
    <ul className="divide-y divide-line">
      {d.topPages.map((p) => (
        <li key={p.path} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[1fr_auto_auto_auto]">
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium" title={p.path}>{pageName(p.path, p.kind)}</span>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <span className="block h-full rounded-full bg-accent/70" style={{ width: `${(p.views / max) * 100}%` }} />
            </span>
          </span>
          <span className="text-right text-xs tabular-nums"><b className="text-sm">{n(p.views)}</b> <span className="text-muted">views</span></span>
          <span className="hidden text-right text-xs tabular-nums text-muted sm:block">{n(p.visitors)} visitors</span>
          <span className="hidden w-16 text-right text-xs tabular-nums text-muted sm:block">{clock(p.avgSeconds)}</span>
        </li>
      ))}
    </ul>
  );
}

const SOURCE_TONE: Record<string, Tone> = { search: "good", social: "info", referral: "accent", direct: "muted" };
const SOURCE_NAME: Record<string, string> = { search: "Search engines", social: "Social & chat", referral: "Other websites", direct: "Direct or unknown" };

function Overview({ d, range }: { d: OverviewData; range: Range }) {
  const t = d.totals;
  const p = d.previous;
  const vs = RANGE_VS[range];
  if (t.pageviews === 0) {
    return (
      <>
        <CollectorStrip h={d.health} asOf={d.meta.asOf} />
        <div className="mt-5">
          <Empty icon={<Activity className="h-5 w-5" />} title="No traffic recorded in this period" hint="Page views appear here a few seconds after a visitor opens a page." />
        </div>
      </>
    );
  }
  const sources = d.sources.map((s) => ({ label: SOURCE_NAME[s.label] ?? title(s.label), value: s.value, tone: SOURCE_TONE[s.label] ?? ("muted" as Tone) }));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Visitors" value={t.visitors} icon={<Users className="h-4 w-4" />} tone="accent" sub={<Delta value={change(t.visitors, p.visitors)} vs={vs} />} />
        <Stat label="Page views" value={t.pageviews} icon={<Eye className="h-4 w-4" />} tone="info" sub={<Delta value={change(t.pageviews, p.pageviews)} vs={vs} />} />
        <Stat label="Visits" value={t.sessions} icon={<Activity className="h-4 w-4" />} sub={<Delta value={change(t.sessions, p.sessions)} vs={vs} />} />
        <Stat label="Pages per visit" value={t.pagesPerSession} icon={<MousePointerClick className="h-4 w-4" />} sub={<Delta value={change(t.pagesPerSession, p.pagesPerSession)} vs={vs} />} />
        <Stat label="Bounce rate" value={`${t.bounceRate}%`} icon={<ArrowUpRight className="h-4 w-4" />} sub={<Delta value={change(t.bounceRate, p.bounceRate)} lowerIsBetter vs={vs} />} />
        <Stat label="Time on page" value={clock(t.avgSeconds)} icon={<Clock className="h-4 w-4" />} sub={t.reportedPct < 100 ? `from the ${t.reportedPct}% of views that reported it` : "average, while the page was in use"} />
      </div>

      <Card>
        <SectionTitle hint={d.meta.hourly ? "Per hour today, UTC" : "Per day, UTC"} action={<Badge tone={d.online ? "good" : "muted"} dot>{n(d.online)} active in the last 5 minutes</Badge>}>
          Traffic
        </SectionTitle>
        <Trend data={d.series} hourly={d.meta.hourly} label={`Traffic, ${RANGE_LABEL[range].toLowerCase()}`} />
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <SectionTitle hint="By page views. Time is how long the page was in use.">Top pages</SectionTitle>
          <Pages d={d} />
        </Card>
        <Card className="xl:col-span-2">
          <SectionTitle hint="The first page of a visit">Where visits start</SectionTitle>
          <BarList rows={d.entryPages.map((r) => ({ label: r.label, value: r.value }))} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle hint="Arrivals, by where the visitor came from">Sources</SectionTitle>
          <Split parts={sources.length ? sources : [{ label: "No arrivals yet", value: 0, tone: "muted" }]} />
          {d.referrers.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Top referring sites</h3>
              <BarList rows={d.referrers.map((r) => ({ label: r.label, value: r.value }))} tone="info" />
            </>
          )}
          {d.campaigns.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Campaigns (utm source / medium / campaign)</h3>
              <BarList rows={d.campaigns.map((r) => ({ label: r.label, value: r.value }))} tone="accent" />
            </>
          )}
        </Card>
        <Card>
          <SectionTitle hint="Distinct visitors; from the network's country header, never an address lookup">Countries</SectionTitle>
          <BarList rows={d.countries.map((r) => ({ label: country(r.label), value: r.value }))} tone="good" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <SectionTitle>Devices</SectionTitle>
          <BarList rows={d.devices.map((r) => ({ label: title(r.label), value: r.value }))} />
        </Card>
        <Card>
          <SectionTitle>Browsers</SectionTitle>
          <BarList rows={d.browsers} tone="info" />
        </Card>
        <Card>
          <SectionTitle>Systems</SectionTitle>
          <BarList rows={d.systems} tone="info" />
        </Card>
        <Card>
          <SectionTitle hint="Browser language">Languages</SectionTitle>
          <BarList rows={d.languages.map((r) => ({ label: language(r.label), value: r.value }))} tone="good" />
        </Card>
      </div>

      <Card>
        <SectionTitle hint="When readers are around">Time of day</SectionTitle>
        <HourBars hours={d.hours} />
      </Card>

      <CollectorStrip h={d.health} asOf={d.meta.asOf} />
    </div>
  );
}

function WorkTable({ rows, empty }: { rows: TopWork[]; empty: string }) {
  if (!rows.length) return <p className="py-6 text-center text-xs text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((w) => (
        <li key={w.publicId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
          <Cover src={thumbUrl(w.coverKey)} w={36} h={50} />
          <span className="min-w-0 flex-1 basis-40">
            <Link href={`/console/works?q=${w.publicId}`} className="block truncate text-[13px] font-semibold hover:text-accent" title={w.title}>{w.title}</Link>
            <span className="block text-[11px] text-muted">#{w.publicId}{w.slug && <> · <a className="hover:text-accent" href={workHref(w)} target="_blank" rel="noreferrer noopener">open on site</a></>}</span>
          </span>
          <dl className="grid w-full grid-cols-4 gap-x-3 text-right text-xs tabular-nums sm:w-auto">
            {([["views", w.views], ["opened", w.reads], ["finished", w.finished], ["saved", w.saves]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt><dd className="font-semibold">{n(v)}</dd></div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Content({ d }: { d: ContentData }) {
  const top = Math.max(1, d.funnel[0]?.value ?? 0);
  const empty = !d.works.length && !d.topRead.length && d.funnel[0]?.value === 0;
  if (empty) return <Empty icon={<Activity className="h-5 w-5" />} title="No reading recorded in this period" hint="Once visitors open works and the reader, this fills in." />;
  const a = d.actions;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Chapters opened" value={d.reading.chapterOpens} icon={<Eye className="h-4 w-4" />} tone="accent" />
        <Stat label="Readers" value={d.reading.readers} icon={<Users className="h-4 w-4" />} tone="info" sub={`${d.reading.chaptersPerReader} chapters each`} />
        <Stat label="Chapters finished" value={`${d.reading.finishedRate}%`} icon={<ShieldCheck className="h-4 w-4" />} tone="good" sub="reached the last page" />
        <Stat label="Pages read" value={d.reading.avgPagesRead ?? "-"} icon={<MousePointerClick className="h-4 w-4" />} sub="average per chapter" />
        <Stat label="Saved" value={Math.max(0, a.saves - a.unsaves)} sub={`${n(a.follows)} follows · ${n(a.downloads)} downloads · ${n(a.shares)} shares`} />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <SectionTitle hint="Distinct visitors at each step (a returning visitor counts once per day)">From visit to finished chapter</SectionTitle>
          <BarList rows={d.funnel.map((f, i) => ({ label: i === 0 ? f.label : `${f.label} · ${pct(f.value, top)}%`, value: f.value }))} tone="good" />
        </Card>
        <Card>
          <SectionTitle hint="By page views">What visitors look at</SectionTitle>
          <BarList rows={d.kinds.map((k) => ({ label: KIND_LABEL[k.label] ?? k.label, value: k.value }))} tone="info" />
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <SectionTitle hint="Most viewed work pages">Top works</SectionTitle>
          <WorkTable rows={d.works} empty="No work page was viewed." />
        </Card>
        <Card>
          <SectionTitle hint="Most chapters opened in the reader">Most read</SectionTitle>
          <WorkTable rows={d.topRead} empty="No chapter was opened." />
        </Card>
      </div>
      <Card>
        <SectionTitle hint="Tag, artist, parody, character and category pages">Most visited listings</SectionTitle>
        <BarList rows={d.tags} empty="No listing page was viewed." />
      </Card>
    </div>
  );
}

function SearchTab({ d }: { d: SearchData }) {
  if (!d.searches) return <Empty icon={<SearchIcon className="h-5 w-5" />} title="No searches in this period" hint="Searches (and how many works each found) appear here." />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Searches" value={d.searches} icon={<SearchIcon className="h-4 w-4" />} tone="accent" />
        <Stat label="People who searched" value={d.searchers} icon={<Users className="h-4 w-4" />} tone="info" />
        <Stat label="Found nothing" value={`${d.zeroRate}%`} icon={<FileX className="h-4 w-4" />} tone={d.zeroRate > 25 ? "warn" : "good"} sub="searches with no result" className="col-span-2 lg:col-span-1" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <SectionTitle hint="Lower-case, first 80 characters; text that looks like contact details is never stored">Top searches</SectionTitle>
          <ul className="divide-y divide-line">
            {d.top.map((s) => (
              <li key={s.query} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13px]" title={s.query}>{s.query}</span>
                <span className="text-xs tabular-nums text-muted">{s.avgResults == null ? "" : `${n(s.avgResults)} results`}</span>
                {s.zero > 0 && <Badge tone="warn">{n(s.zero)} empty</Badge>}
                <b className="w-10 text-right text-sm tabular-nums">{n(s.count)}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card edge="warn">
          <SectionTitle hint="What visitors wanted and the site could not show: a tag to add, a spelling to alias, a title to ingest">Searches with no result</SectionTitle>
          {d.zero.length ? (
            <ul className="divide-y divide-line">
              {d.zero.map((s) => (
                <li key={s.query} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={s.query}>{s.query}</span>
                  <Link href={`/console/tags?q=${encodeURIComponent(s.query)}`} className="-my-1 inline-flex min-h-[32px] items-center px-1 text-xs text-accent hover:underline">find tag</Link>
                  <b className="w-10 text-right text-sm tabular-nums">{n(s.count)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-xs text-muted">Every search found something.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

const RATING_TONE: Record<string, Tone> = { good: "good", "needs-improvement": "warn", poor: "bad" };
const RATING_TEXT: Record<string, string> = { good: "Good", "needs-improvement": "Needs work", poor: "Poor" };

function VitalCard({ v }: { v: VitalSummary }) {
  const info = VITAL_INFO[v.metric]!;
  const r = rate(v.metric, v.p75);
  return (
    <div className="c-card c-card-pad">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{v.metric}</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold tabular-nums leading-none">{formatVital(v.metric, v.p75)}</div>
        </div>
        {r && <Badge tone={RATING_TONE[r]} dot>{RATING_TEXT[r]}</Badge>}
      </div>
      <p className="mt-2 text-xs text-muted" title={info.name}>{info.about}</p>
      {v.samples > 0 ? (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${pct(v.good, v.samples)}% good, ${pct(v.needs, v.samples)}% needs work, ${pct(v.poor, v.samples)}% poor`}>
            <span className="bg-good" style={{ width: `${(v.good / v.samples) * 100}%` }} />
            <span className="bg-warn" style={{ width: `${(v.needs / v.samples) * 100}%` }} />
            <span className="bg-bad" style={{ width: `${(v.poor / v.samples) * 100}%` }} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            <span className="font-semibold text-good">{pct(v.good, v.samples)}% good</span> · <span className="font-semibold text-warn">{pct(v.needs, v.samples)}% needs work</span> · <span className="font-semibold text-bad">{pct(v.poor, v.samples)}% poor</span>
          </p>
          <p className="mt-1 text-[11px] text-muted">75th percentile of {n(v.samples)} visits · good up to {formatVital(v.metric, info.good)}</p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-muted">No samples yet.</p>
      )}
    </div>
  );
}

function Health({ d }: { d: HealthData }) {
  const some = d.vitals.all.some((v) => v.samples > 0);
  return (
    <div className="space-y-5">
      <Note tone="info" icon={<Info className="h-4 w-4" />}>
        Real measurements from visitors&apos; own browsers, for the first page of each visit. This is what Google&apos;s ranking uses (the 75th percentile), unlike a one-off lab test. Numbers stay empty until enough visitors have loaded pages.
      </Note>
      {(["all", "mobile", "desktop"] as const).map((k) => (
        <section key={k} aria-labelledby={`v-${k}`}>
          <SectionTitle>
            <span id={`v-${k}`}>{k === "all" ? "All visitors" : k === "mobile" ? "Phones" : "Computers"}</span>
          </SectionTitle>
          {some || k === "all" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {d.vitals[k].map((v) => <VitalCard key={v.metric} v={v} />)}
            </div>
          ) : null}
        </section>
      ))}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle hint="Visitors who saw the 18+ gate, and how many went on">Age gate</SectionTitle>
          <div className="flex items-end gap-6">
            <div><div className="font-display text-3xl font-extrabold tabular-nums">{d.gate.rate}%</div><div className="text-xs text-muted">entered</div></div>
            <div className="text-xs text-muted"><b className="text-text">{n(d.gate.passed)}</b> of <b className="text-text">{n(d.gate.shown)}</b> visitors confirmed they are adults and continued.</div>
          </div>
        </Card>
        <Card edge={d.notFoundTotal ? "warn" : undefined}>
          <SectionTitle hint="Addresses visitors asked for that do not exist. Fix links, or add a redirect">Pages not found ({n(d.notFoundTotal)})</SectionTitle>
          <BarList rows={d.notFound.map((r: Row) => ({ label: r.label, value: r.value }))} tone="warn" empty="No missing pages hit. Good." />
        </Card>
      </div>
      <CollectorStrip h={d.health} asOf={d.meta.asOf} />
    </div>
  );
}

function Privacy() {
  return (
    <details className="c-card c-card-pad mt-8 text-xs leading-relaxed text-muted">
      <summary className="-my-1.5 cursor-pointer py-2 text-[13px] font-semibold text-text">What is measured, and what is not</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li><b className="text-text">No cookie, no stored identifier, no IP address.</b> A visitor is a one-way hash of the connection and browser, mixed with a secret and today&apos;s date, so it cannot be followed to tomorrow or turned back into an address. A returning visitor counts once per day, so totals over several days add days up.</li>
        <li><b className="text-text">Stored per page view:</b> the page (without its query), the country, the device, browser and system class, the browser language, how the visitor arrived (host only, and campaign tags), and how long the page was in use.</li>
        <li><b className="text-text">Stored per action:</b> searches (the words only), chapters opened and how far they were read, saves, follows, downloads, shares, passing the age gate, pages not found, and speed measurements.</li>
        <li><b className="text-text">Not measured:</b> visitors who send Do Not Track or Global Privacy Control, robots and crawlers, signed-in admins, previews, and anything in this console.</li>
        <li>Raw rows are deleted after {RETENTION_DAYS} days. Times are UTC. A visit ends after 30 minutes without a page view; a visit that crosses midnight UTC counts as two.</li>
      </ul>
    </details>
  );
}

export function AnalyticsView({ data, range }: { data: AnalyticsData; range: Range }) {
  const tab = data.tab;
  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Anonymous traffic on the public site: who comes, from where, what they read and how fast it loads. No cookies and no personal data are collected."
        actions={<RangePicker tab={tab} range={range} />}
      />
      <Tabs items={TABS.map((t) => ({ href: href(t.id, range), label: t.label, active: t.id === tab }))} />
      {data.tab === "overview" && <Overview d={data.d} range={range} />}
      {data.tab === "content" && <Content d={data.d} />}
      {data.tab === "search" && <SearchTab d={data.d} />}
      {data.tab === "health" && <Health d={data.d} />}
      <Privacy />
    </div>
  );
}
