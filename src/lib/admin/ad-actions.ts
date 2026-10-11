"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { hasRole, requireAdmin } from "@/lib/admin/auth";
import { ADS_TAG } from "@/lib/ads/serve";
import { deleteAd, duplicateAd, saveAd, setAdActive, setAdsEnabled, type Result } from "@/lib/admin/ads-core";

/**
 * The Ads screens' actions (FormData in, because the console's ActionForm submits a form). Each one needs an admin or the
 * owner, and after a change the pages' cached ad lists are dropped, so it takes effect on the very next page view.
 */
function refresh(r: Result): Result {
  if (r.ok) {
    revalidateTag(ADS_TAG);
    revalidatePath("/console", "layout");
  }
  return r;
}

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function saveAdAction(fd: FormData): Promise<Result> {
  const me = await requireAdmin("ADMIN");
  const raw: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") raw[k] = v;
  return refresh(await saveAd(prisma, me, text(fd, "id") || null, raw, hasRole(me, "OWNER")));
}

export async function setAdActiveAction(fd: FormData): Promise<Result> {
  const me = await requireAdmin("ADMIN");
  return refresh(await setAdActive(prisma, me, text(fd, "id"), text(fd, "active") === "true"));
}

export async function duplicateAdAction(fd: FormData): Promise<Result> {
  const me = await requireAdmin("ADMIN");
  return refresh(await duplicateAd(prisma, me, text(fd, "id")));
}

export async function deleteAdAction(fd: FormData): Promise<Result> {
  const me = await requireAdmin("ADMIN");
  return refresh(await deleteAd(prisma, me, text(fd, "id")));
}

export async function setAdsEnabledAction(fd: FormData): Promise<Result> {
  const me = await requireAdmin("ADMIN");
  return refresh(await setAdsEnabled(prisma, me, text(fd, "on") === "true"));
}
