import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME} - Read manga and doujinshi online free`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The default share card: used by every page that does not have its own. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 84,
          color: "#fff",
          backgroundColor: "#0b0b10",
          backgroundImage: "radial-gradient(circle at 85% 15%, rgba(139,92,246,0.35), rgba(11,11,16,0) 55%), radial-gradient(circle at 10% 100%, rgba(255,71,133,0.3), rgba(11,11,16,0) 50%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundImage: "linear-gradient(135deg, #ff4785, #8b5cf6)",
            }}
          >
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4v13a3 3 0 0 0 3 3h9" />
              <path d="M10 8h7M10 12h4" />
            </svg>
          </div>
          <div style={{ display: "flex", marginLeft: 24, fontSize: 56, fontWeight: 800 }}>
            <span>Lust</span>
            <span style={{ color: "#ff4785" }}>Manga</span>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 52, fontSize: 76, fontWeight: 800, lineHeight: 1.08, maxWidth: 940 }}>Read manga & doujinshi online, free</div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 32, color: "#a3a3b8" }}>Every language · a fast book-style reader · new uploads daily</div>
        <div style={{ display: "flex", marginTop: 44 }}>
          <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, fontSize: 24, fontWeight: 700, backgroundColor: "rgba(255,255,255,0.1)" }}>Adults only · 18+</div>
        </div>
      </div>
    ),
    size,
  );
}
