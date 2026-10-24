import Link from "@/components/site/Link";
import { ArrowRight, Eye, EyeOff, Info, Megaphone, MousePointerClick, Power, ShieldCheck } from "lucide-react";
import { setAdsEnabledAction } from "@/lib/admin/ad-actions";
import { REVENUE_LABEL, type Band, type SlotGroup } from "@/lib/ads/registry";
import type { AdsOverview, SlotSummary } from "@/lib/ads/types";
import { RANGE_LABEL } from "@/lib/analytics/ranges";
import { ActionForm } from "../ActionForm";
import { RangeNav } from "../RangeNav";
import { Badge, Card, DayBars, Empty, Note, PageHeader, SectionTitle, Stat, type Tone } from "../ui";

const GROUPS: SlotGroup[] = ["Home", "Lists", "Search", "Work page", "Reader", "Site-wide"];
const BAND: Record<Band, string> = { all: "any device", desktop: "computers", mobile: "phones" };
const REV_TONE: Record<SlotSummary["revenue"], Tone> = { top: "good", strong: "accent", steady: "muted" };
const n = (v: number) => v.toLocaleString();

function Row({ s, range }: { s: SlotSummary; range: string }) {
  const total = s.ads.live + s.ads.paused + s.ads.scheduled + s.ads.ended;
  const status: { tone: Tone; text: string } =
    s.ads.live > 0 ? { tone: "good", text: `${s.ads.live} live` } : s.ads.scheduled > 0 ? { tone: "info", text: `${s.ads.scheduled} scheduled` } : total > 0 ? { tone: "warn", text: s.ads.paused ? `${s.ads.paused} paused` : "ended" } : { tone: "muted", text: "empty" };
  return (
    <li>
      <Link
        href={`/console/ads/${s.key}?range=${range}`}
        className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 sm:px-5"
      >
        <span className="min-w-0 flex-1 basis-64">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{s.label}</span>
            <Badge tone={status.tone} dot>{status.text}</Badge>
            <Badge tone={REV_TONE[s.revenue]}>{REVENUE_LABEL[s.revenue]}</Badge>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">{s.where}</span>
          <span className="mt-1 block text-[11px] text-muted">{s.kind === "popunder" ? "A script, not a box" : `Fits ${s.bands.filter((b) => b !== "all").map((b) => BAND[b]).join(" and ")}`}</span>
        </span>
        <span className="flex items-center gap-5 text-right text-xs tabular-nums">
          <span><b className="block text-sm">{n(s.impressions)}</b><span className="text-muted">{s.kind === "popunder" ? "loads" : "shown"}</span></span>
          <span><b className="block text-sm">{s.kind === "popunder" ? "-" : n(s.clicks)}</b><span className="text-muted">clicks</span></span>
          <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

export function AdsView({ d }: { d: AdsOverview }) {
  const live = d.enabled && !d.envOff;
  const none = d.totals.liveAds === 0;
  return (
    <div>
      <PageHeader
        title="Ads"
        description="Where ads can appear on the public site, which ads fill each place, and how they perform. Nothing is shown in a place until you add an ad to it."
        actions={<RangeNav base="/console/ads" range={d.range} />}
      />

      <Card edge={live ? "good" : "bad"} className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${live ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`} aria-hidden="true">
            <Power className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="font-display text-base font-bold">{d.envOff ? "Ads are switched off for the whole deployment" : d.enabled ? "Ads are on" : "Ads are off"}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {d.envOff
                ? "The ADS=off setting in the hosting environment overrides this screen. Remove it to show ads again."
                : d.enabled
                  ? `${n(d.totals.liveAds)} live ${d.totals.liveAds === 1 ? "ad" : "ads"} across ${n(d.totals.slotsLive)} of ${d.slots.length} places. The switch hides every ad and the pop-under at once and changes none of them.`
                  : "Every ad and the pop-under are hidden. The ads themselves are untouched; turn this back on to show them."}
            </p>
          </div>
          {!d.envOff && (
            <ActionForm
              action={setAdsEnabledAction}
              confirm={d.enabled ? { title: "Turn all ads off?", message: "Visitors see no ads and no pop-under until you turn them back on. No ad is changed or deleted.", confirmLabel: "Turn off" } : undefined}
              danger={d.enabled}
            >
              <input type="hidden" name="on" value={String(!d.enabled)} />
              <button className={d.enabled ? "c-btn-bad" : "c-btn-good"}>{d.enabled ? "Turn ads off" : "Turn ads on"}</button>
            </ActionForm>
          )}
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ad boxes shown" value={d.totals.impressions} icon={<Eye className="h-4 w-4" />} tone="accent" sub={`${RANGE_LABEL[d.range].toLowerCase()}, counted when half in view for a second`} />
        <Stat label="Banner clicks" value={d.totals.clicks} icon={<MousePointerClick className="h-4 w-4" />} tone="info" sub="ad-network clicks are in the network's own report" />
        <Stat label="Live ads" value={d.totals.liveAds} icon={<Megaphone className="h-4 w-4" />} tone="good" sub={`in ${d.totals.slotsLive} of ${d.slots.length} places`} />
        <Stat label="Hidden from" value="Robots, admins" icon={<EyeOff className="h-4 w-4" />} sub="and everyone until the 18+ gate is passed" />
      </div>

      {d.totals.impressions > 0 && (
        <Card className="mb-5">
          <SectionTitle hint="Per day, UTC">Ad boxes shown</SectionTitle>
          <DayBars data={d.series} label="Ad boxes shown" />
        </Card>
      )}

      <div className="mb-6 space-y-3">
        <Note tone="info" icon={<Info className="h-4 w-4" />}>
          <b className="text-text">To see your own ads, open the site in a private window.</b> You will not see ads while signed in to this console: that keeps you from clicking your own ads, which ad networks treat as fraud. Robots never see ads either, and visitors see them only after confirming they are adults.
        </Note>
        {none && (
          <Note tone="warn" icon={<ShieldCheck className="h-4 w-4" />}>
            <b className="text-text">Start here:</b> pick a place below, choose <i>Ad code</i> (paste the embed code from ExoClick or another adult-friendly network) or <i>Banner image</i> (a direct deal), tick <i>Live</i> and save. It appears on the very next page view. A good first set: <i>Lists: inside the grid</i>, <i>Reader: end of chapter</i>, <i>Work page: before the description</i> and the <i>Site-wide pop-under</i>.
          </Note>
        )}
      </div>

      {d.slots.length === 0 ? (
        <Empty title="No places defined" />
      ) : (
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const rows = d.slots.filter((s) => s.group === g);
            if (!rows.length) return null;
            return (
              <section key={g} aria-label={g}>
                <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-muted">{g}</h2>
                <Card pad={false}>
                  <ul className="c-divide">{rows.map((s) => <Row key={s.key} s={s} range={d.range} />)}</ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
