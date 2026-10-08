import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { categoryLabel, langLabel } from "@/lib/format";
import { cannotDraw, coverDataUri, loadTitleFonts, needsExtraFont } from "@/lib/og";
import { clip, titleCase } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";
import { idParam } from "@/lib/url";

export const alt = `Read on ${SITE_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// a share card is built once, then served from cache: social crawlers revisit the same URL often
export const revalidate = 86400;

/** The share card for one work: its cover, title, language and tags on the site's colours. */
export default async function Image({ params }: { params: Promise<{ ref: string }> }) {
  const id = idParam((await params).ref);
  const w = id
    ? await prisma.work
        .findFirst({
          where: { publicId: id, publish: "PUBLISHED" },
          select: { title: true, language: true, category: true, pageCount: true, coverKey: true, tags: { where: { hidden: false, type: "TAG" }, orderBy: { count: "desc" }, take: 4, select: { name: true } } },
        })
        .catch(() => null)
    : null;

  const title = w?.title ?? SITE_NAME;
  const meta = w ? [langLabel(w.language), categoryLabel(w.category), `${w.pageCount} pages`] : [];
  const tags = (w?.tags ?? []).map((t) => titleCase(t.name)).filter((t) => !cannotDraw(t));
  const cover = await coverDataUri(w?.coverKey ?? null);
  const everyChar = [title, ...meta, ...tags, "Read online free", SITE_NAME].join("");
  const extra = needsExtraFont(everyChar);
  const fonts = extra ? await loadTitleFonts(everyChar) : [];
  // a title the card cannot draw (no font could be loaded, or a script it cannot shape) becomes a plain label, never boxes
  const undrawable = cannotDraw(title) || (needsExtraFont(title) && fonts.length === 0);
  const shownTitle = undrawable ? `${categoryLabel(w?.category ?? "MANGA")} #${id ?? ""}` : clip(title, 90);
  const fontSize = shownTitle.length > 60 ? 44 : shownTitle.length > 34 ? 54 : 64;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          color: "#fff",
          backgroundColor: "#0b0b10",
          backgroundImage: "radial-gradient(circle at 20% 0%, rgba(139,92,246,0.3), rgba(11,11,16,0) 55%), radial-gradient(circle at 0% 100%, rgba(255,71,133,0.28), rgba(11,11,16,0) 50%)",
          ...(fonts.length ? { fontFamily: fonts.map((f) => `"${f.name}"`).join(", ") } : {}),
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "56px 56px 56px 72px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: "linear-gradient(135deg, #ff4785, #8b5cf6)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4v13a3 3 0 0 0 3 3h9" />
                <path d="M10 8h7M10 12h4" />
              </svg>
            </div>
            <div style={{ display: "flex", marginLeft: 16, fontSize: 30, fontWeight: 800 }}>
              <span>Lust</span>
              <span style={{ color: "#ff4785" }}>Manga</span>
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 44, fontSize, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}>{shownTitle}</div>

          {meta.length > 0 && (
            <div style={{ display: "flex", marginTop: 30 }}>
              {meta.map((m, i) => (
                <div key={m} style={{ display: "flex", marginRight: 12, padding: "9px 20px", borderRadius: 999, fontSize: 25, fontWeight: 700, backgroundColor: i === 0 ? "#d61c60" : "rgba(255,255,255,0.12)" }}>
                  {m}
                </div>
              ))}
            </div>
          )}
          {tags.length > 0 && <div style={{ display: "flex", marginTop: 24, fontSize: 26, color: "#a3a3b8" }}>{tags.join("  ·  ")}</div>}
          <div style={{ display: "flex", marginTop: 36, fontSize: 28, fontWeight: 700, color: "#ff4785" }}>Read online free →</div>
        </div>

        {cover && (
          <div style={{ display: "flex", width: 420, height: 630, flexShrink: 0, boxShadow: "-30px 0 80px rgba(0,0,0,0.55)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} width={420} height={630} alt="" style={{ objectFit: "cover" }} />
          </div>
        )}
      </div>
    ),
    // passing `fonts: undefined` would stop the renderer loading its default font, so the key is only present when there is one
    { ...size, ...(fonts.length ? { fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: 800 as const, style: "normal" as const })) } : {}) },
  );
}
