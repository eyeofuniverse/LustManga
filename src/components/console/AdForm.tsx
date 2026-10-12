"use client";

import { useState } from "react";
import { Eye, EyeOff, Plus, Save } from "lucide-react";
import { saveAdAction } from "@/lib/admin/ad-actions";
import { FRAME_SANDBOX, buildFrameDoc } from "@/lib/ads/client";
import type { AdRow, SlotPage } from "@/lib/ads/types";
import { ActionForm } from "./ActionForm";

type Slot = SlotPage["slot"];
const BAND_LABEL = { all: "Any device", desktop: "Computers and tablets", mobile: "Phones" } as const;
const sizeText = (s: { w: number; h: number } | null) => (s ? `${s.w}×${s.h}` : "none");
const local = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

/**
 * A preview that cannot hurt: the ad's code runs in a frame with no access to this console (no same-origin), whatever
 * isolation the ad is saved with. A network that only serves ads on the real site will show an empty box here.
 */
function Preview({ type, code, imageUrl, width, height }: { type: "code" | "banner"; code: string; imageUrl: string; width: number; height: number }) {
  if (type === "banner")
    return imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="Banner preview" className="mx-auto block max-w-full rounded-lg ring-1 ring-line" style={{ maxHeight: 400 }} />
    ) : (
      <p className="py-6 text-center text-xs text-muted">Enter the image address to see it.</p>
    );
  return code.trim() ? (
    <iframe title="Ad preview" sandbox={FRAME_SANDBOX} srcDoc={buildFrameDoc(code)} width={width} height={height} scrolling="no" className="mx-auto block max-w-full rounded-lg border-0 bg-surface-2" />
  ) : (
    <p className="py-6 text-center text-xs text-muted">Paste the ad code to see it.</p>
  );
}

export function AdForm({ slot, ad, device, canCode }: { slot: Slot; ad?: AdRow; device?: AdRow["device"]; canCode: boolean }) {
  const id = ad?.id ?? `new-${device ?? "all"}`;
  const [type, setType] = useState<"code" | "banner">(ad?.type ?? (canCode ? "code" : "banner"));
  const [dev, setDev] = useState<AdRow["device"]>(ad?.device ?? device ?? "all");
  const [code, setCode] = useState(ad?.code ?? "");
  const [image, setImage] = useState(ad?.imageUrl ?? "");
  const [open, setOpen] = useState(false);
  const isPop = slot.kind === "popunder";
  const size = dev === "mobile" ? slot.mobile : slot.desktop ?? slot.mobile;
  const w = ad?.width ?? size?.w ?? 300;
  const h = ad?.height ?? size?.h ?? 250;

  // Ad code is JavaScript that runs in every visitor's browser, so only the owner writes it; any admin can still pause, copy or remove it
  if (!canCode && (isPop || ad?.type === "code"))
    return (
      <p className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs leading-relaxed text-muted">
        {ad ? "This ad is ad code, which only the owner can change. You can still pause it, copy it or remove it with the buttons below." : "The pop-under is a script that runs on every page, so only the owner can add it."}
      </p>
    );
  return (
    <ActionForm action={saveAdAction}>
    <div className="space-y-5">
      <input type="hidden" name="slot" value={slot.key} />
      {ad && <input type="hidden" name="id" value={ad.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="c-label" htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} name="name" defaultValue={ad?.name ?? ""} placeholder="e.g. ExoClick 728x90 or Summer offer" maxLength={120} required className="c-input" />
        </div>
        <div className="space-y-1">
          <label className="c-label" htmlFor={`${id}-device`}>Shown on</label>
          <select id={`${id}-device`} name="device" value={dev} onChange={(e) => setDev(e.target.value as AdRow["device"])} className="c-input">
            {slot.bands.map((b) => (
              <option key={b} value={b}>{BAND_LABEL[b]}</option>
            ))}
          </select>
        </div>
      </div>

      {!isPop && !canCode && (
        <>
          <input type="hidden" name="type" value="banner" />
          <p className="text-xs text-muted">You can add banner images (an image and a link). Ad code from a network can only be added by the owner.</p>
        </>
      )}
      {!isPop && canCode && (
        <fieldset className="space-y-2">
          <legend className="c-label">What kind of ad</legend>
          <div className="inline-flex gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Ad type">
            {(["code", "banner"] as const).map((t) => (
              <label key={t} className={`cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${type === t ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}>
                <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
                {t === "code" ? "Ad code (from a network)" : "Banner image (a direct deal)"}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {isPop && <input type="hidden" name="type" value="code" />}

      {type === "code" || isPop ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="c-label" htmlFor={`${id}-code`}>{isPop ? "Pop-under script" : "Ad code"}</label>
            <textarea id={`${id}-code`} name="code" value={code} onChange={(e) => setCode(e.target.value)} rows={6} spellCheck={false} placeholder={'<script async src="https://…/ad-provider.js"></script>\n<ins class="…" data-zoneid="…"></ins>\n<script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>'} className="c-input font-mono text-xs leading-relaxed" />
            <p className="text-xs text-muted">Paste the whole embed code exactly as the network gives it. It is stored as written and runs on the public site only, never in this console.</p>
          </div>
          {!isPop && (
            <div className="space-y-1">
              <label className="c-label" htmlFor={`${id}-iso`}>Where the code runs</label>
              <select id={`${id}-iso`} name="isolation" defaultValue={ad?.isolation ?? "inline"} className="c-input">
                <option value="inline">In the page (what most ad networks expect)</option>
                <option value="frame">In an isolated frame (safer; some networks will not serve ads there)</option>
              </select>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="c-label" htmlFor={`${id}-img`}>Image address</label>
            <input id={`${id}-img`} name="imageUrl" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…/banner.png" inputMode="url" className="c-input" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="c-label" htmlFor={`${id}-link`}>Link address (where a click goes)</label>
            <input id={`${id}-link`} name="linkUrl" defaultValue={ad?.linkUrl ?? ""} placeholder="https://advertiser.example/offer?ref=…" inputMode="url" className="c-input" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="c-label" htmlFor={`${id}-alt`}>Description for screen readers</label>
            <input id={`${id}-alt`} name="alt" defaultValue={ad?.alt ?? ""} maxLength={300} placeholder="What the banner says" className="c-input" />
          </div>
        </div>
      )}

      {!isPop && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <label className="c-label" htmlFor={`${id}-w`}>Width (px)</label>
            <input id={`${id}-w`} name="width" type="number" min={1} max={2000} defaultValue={ad?.width ?? ""} placeholder={size ? String(size.w) : ""} className="c-input" />
          </div>
          <div className="space-y-1">
            <label className="c-label" htmlFor={`${id}-h`}>Height (px)</label>
            <input id={`${id}-h`} name="height" type="number" min={1} max={2000} defaultValue={ad?.height ?? ""} placeholder={size ? String(size.h) : ""} className="c-input" />
          </div>
          <div className="space-y-1">
            <label className="c-label" htmlFor={`${id}-prio`}>Priority</label>
            <input id={`${id}-prio`} name="priority" type="number" min={-100} max={100} defaultValue={ad?.priority ?? 0} className="c-input" />
          </div>
          <div className="space-y-1">
            <label className="c-label" htmlFor={`${id}-wt`}>Weight</label>
            <input id={`${id}-wt`} name="weight" type="number" min={1} max={100} defaultValue={ad?.weight ?? 1} className="c-input" />
          </div>
        </div>
      )}
      {isPop && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <div className="space-y-1">
            <label className="c-label" htmlFor={`${id}-prio`}>Priority</label>
            <input id={`${id}-prio`} name="priority" type="number" min={-100} max={100} defaultValue={ad?.priority ?? 0} className="c-input" />
          </div>
          <div className="space-y-1">
            <label className="c-label" htmlFor={`${id}-wt`}>Weight</label>
            <input id={`${id}-wt`} name="weight" type="number" min={1} max={100} defaultValue={ad?.weight ?? 1} className="c-input" />
          </div>
        </div>
      )}
      {!isPop && <p className="text-xs text-muted">Leave the size empty to use the slot&apos;s own ({sizeText(slot.desktop)} on computers, {sizeText(slot.mobile)} on phones). When several ads fit, the one with the highest priority is shown; ads of equal priority take turns in proportion to their weight.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="c-label" htmlFor={`${id}-from`}>Starts (UTC, optional)</label>
          <input id={`${id}-from`} name="startsAt" type="datetime-local" defaultValue={local(ad?.startsAt ?? null)} className="c-input" />
        </div>
        <div className="space-y-1">
          <label className="c-label" htmlFor={`${id}-to`}>Ends (UTC, optional)</label>
          <input id={`${id}-to`} name="endsAt" type="datetime-local" defaultValue={local(ad?.endsAt ?? null)} className="c-input" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="c-label" htmlFor={`${id}-note`}>Note (for you; visitors never see it)</label>
        <input id={`${id}-note`} name="note" defaultValue={ad?.note ?? ""} maxLength={500} placeholder="e.g. zone 12345, 1-per-day cap set at the network" className="c-input" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 text-[13px] font-semibold">
          <input type="checkbox" name="active" defaultChecked={ad ? ad.active : false} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          Live <span className="font-normal text-muted">(untick to keep it saved but not shown)</span>
        </label>
        <button type="button" onClick={() => setOpen((o) => !o)} className="c-btn-ghost ml-auto" aria-expanded={open}>
          {open ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />} Preview
        </button>
        <button className="c-btn-primary">
          {ad ? <Save className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />} {ad ? "Save changes" : "Add ad"}
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-line bg-bg/40 p-3">
          <Preview type={isPop ? "code" : type} code={code} imageUrl={image} width={w} height={h} />
          {(isPop || type === "code") && (
            <p className="mt-2 text-center text-[11px] text-muted">
              Shown in an isolated frame. A network that only serves ads on your real site may show nothing here. Real network code counts as a view
              (and as a click or a pop-up if you click inside) in the network&apos;s own reports, so preview it sparingly.
            </p>
          )}
        </div>
      )}
    </div>
    </ActionForm>
  );
}
