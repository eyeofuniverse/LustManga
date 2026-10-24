import Link from "@/components/site/Link";
import { ArrowLeft, ChevronDown, Copy, Info, Pause, Play, Plus, Trash2 } from "lucide-react";
import { deleteAdAction, duplicateAdAction, setAdActiveAction } from "@/lib/admin/ad-actions";
import { REVENUE_LABEL, type Band } from "@/lib/ads/registry";
import { ctr } from "@/lib/ads/select";
import type { AdRow, SlotPage } from "@/lib/ads/types";
import { RANGE_LABEL } from "@/lib/analytics/ranges";
import { ago } from "@/lib/admin/format";
import { ActionForm } from "../ActionForm";
import { AdForm } from "../AdForm";
import { RangeNav } from "../RangeNav";
import { Badge, Card, Note, PageHeader, SectionTitle, type Tone } from "../ui";

const BAND_TITLE: Record<Band, string> = { all: "Any device", desktop: "Computers and tablets", mobile: "Phones" };
const BAND_HINT: Record<Band, string> = {
  all: "Used on every device that has no ad of its own below.",
  desktop: "An ad here beats an “any device” ad on computers and tablets.",
  mobile: "An ad here beats an “any device” ad on phones.",
};
const STATUS: Record<AdRow["status"], { tone: Tone; text: string }> = { live: { tone: "good", text: "Live" }, paused: { tone: "muted", text: "Paused" }, scheduled: { tone: "info", text: "Scheduled" }, ended: { tone: "warn", text: "Ended" } };
const n = (v: number) => v.toLocaleString();
const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : null);

function AdCard({ ad, slot, canCode }: { ad: AdRow; slot: SlotPage["slot"]; canCode: boolean }) {
  const st = STATUS[ad.status];
  const isPop = slot.kind === "popunder";
  const schedule = [ad.startsAt ? `from ${when(ad.startsAt)}` : null, ad.endsAt ? `until ${when(ad.endsAt)}` : null].filter(Boolean).join(" ");
  return (
    <details className="group c-card overflow-hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 sm:px-5">
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden="true" />
        <span className="min-w-0 flex-1 basis-56">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{ad.name}</span>
            <Badge tone={st.tone} dot>{st.text}</Badge>
            <Badge tone="muted">{ad.type === "code" ? (isPop ? "Pop-under script" : "Ad code") : "Banner"}</Badge>
          </span>
          <span className="mt-1 block text-xs text-muted">
            priority {ad.priority} · weight {ad.weight}
            {ad.type === "code" && !isPop && ad.isolation === "frame" ? " · isolated frame" : ""}
            {schedule ? ` · ${schedule}` : ""}
          </span>
        </span>
        <span className="flex items-center gap-5 text-right text-xs tabular-nums">
          <span title={`${n(ad.impressionsAll)} since it was added`}><b className="block text-sm">{n(ad.impressions)}</b><span className="text-muted">{isPop ? "script loads" : "shown"}</span></span>
          {ad.type === "banner" && (
            <span title={`${n(ad.clicksAll)} since it was added`}><b className="block text-sm">{n(ad.clicks)}</b><span className="text-muted">clicks · {ctr(ad.clicks, ad.impressions)}%</span></span>
          )}
        </span>
      </summary>
      <div className="space-y-5 border-t border-line bg-bg/30 px-4 py-5 sm:px-5">
        <AdForm key={ad.updatedAt} slot={slot} ad={ad} canCode={canCode} />
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <ActionForm action={setAdActiveAction}>
            <input type="hidden" name="id" value={ad.id} />
            <input type="hidden" name="active" value={String(!ad.active)} />
            <button className="c-btn-default">{ad.active ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />} {ad.active ? "Pause" : "Make live"}</button>
          </ActionForm>
          <ActionForm action={duplicateAdAction}>
            <input type="hidden" name="id" value={ad.id} />
            <button className="c-btn-default"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Duplicate</button>
          </ActionForm>
          <p className="min-w-0 flex-1 basis-40 text-[11px] text-muted sm:text-right">Added {ago(ad.createdAt)}{ad.createdBy ? ` by ${ad.createdBy}` : ""} · {n(ad.impressionsAll)} shown{ad.type === "banner" ? `, ${n(ad.clicksAll)} clicks` : ""} in all</p>
          <ActionForm action={deleteAdAction} confirm={{ title: `Remove “${ad.name}”?`, message: "The ad and its counts are deleted. This cannot be undone. (To keep it for later, pause it instead.)", confirmLabel: "Remove" }} danger>
            <input type="hidden" name="id" value={ad.id} />
            <button className="c-btn-bad"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove</button>
          </ActionForm>
        </div>
      </div>
    </details>
  );
}

export function SlotView({ d }: { d: SlotPage }) {
  const s = d.slot;
  const live = d.enabled && !d.envOff;
  return (
    <div>
      <Link href={`/console/ads?range=${d.range}`} className="mb-2 -ml-1 inline-flex min-h-[36px] items-center gap-1.5 px-1 text-xs font-semibold text-muted transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All ad places
      </Link>
      <PageHeader title={s.label} description={s.where} actions={<RangeNav base={`/console/ads/${s.key}`} range={d.range} />} />

      {!live && (
        <div className="mb-4">
          <Note tone="warn" icon={<Info className="h-4 w-4" />}>
            <b className="text-text">Ads are switched off for the whole site</b>, so nothing here is showing. You can still add and edit ads; turn ads on from the <Link href="/console/ads" className="underline">Ads overview</Link>.
          </Note>
        </div>
      )}

      <Card className="mb-5">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-3">
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Earning</dt><dd className="mt-0.5"><Badge tone={s.revenue === "top" ? "good" : s.revenue === "strong" ? "accent" : "muted"}>{REVENUE_LABEL[s.revenue]}</Badge></dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Computers</dt><dd className="mt-0.5 font-semibold tabular-nums">{s.kind === "popunder" ? "script" : s.desktop ? `${s.desktop.w}×${s.desktop.h}` : "not shown"}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Phones</dt><dd className="mt-0.5 font-semibold tabular-nums">{s.kind === "popunder" ? "script" : s.mobile ? `${s.mobile.w}×${s.mobile.h}` : "not shown"}</dd></div>
          </dl>
          <p className="min-w-0 flex-1 basis-72 text-xs leading-relaxed text-muted">{s.tip}</p>
        </div>
      </Card>

      <p className="mb-3 text-xs text-muted">Numbers are for {RANGE_LABEL[d.range].toLowerCase()}. When several ads fit a visitor, the highest priority is shown, and ads of equal priority take turns by weight.</p>

      <div className="space-y-6">
        {s.bands.map((b) => {
          const ads = d.ads.filter((a) => a.device === b);
          return (
            <section key={b} aria-label={BAND_TITLE[b]}>
              <SectionTitle hint={BAND_HINT[b]}>
                {BAND_TITLE[b]} <span className="font-normal text-muted">({ads.length})</span>
              </SectionTitle>
              {ads.length ? <div className="space-y-3">{ads.map((a) => <AdCard key={a.id} ad={a} slot={s} canCode={d.canEditCode} />)}</div> : <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-xs text-muted">No ad here yet.</p>}
            </section>
          );
        })}

        <section aria-label="Add an ad">
          <details className="group c-card overflow-hidden" open={d.ads.length === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 sm:px-5">
              <Plus className="h-4 w-4 text-accent" aria-hidden="true" /> Add an ad to this place
              <ChevronDown className="ml-auto h-4 w-4 text-muted transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="border-t border-line bg-bg/30 px-4 py-5 sm:px-5">
              <AdForm key={d.ads.length} slot={s} canCode={d.canEditCode} />
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
