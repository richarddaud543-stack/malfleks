import { ImageResponse } from "next/og";

import { PROMISE } from "@/lib/promise";
import { MARK, shareFonts } from "@/lib/share-image";
import { SITE_SHARE_ALT } from "@/lib/site-identity";

/**
 * The picture a MalFleks link carries when it is shared.
 *
 * Until 4 Oct 2026 there was none: a link pasted into a chat arrived as a bare
 * address, in a market where most things are sold by passing links around
 * chats. This says the one thing MalFleks is for, in both languages, and
 * nothing else -- no address on it, because the preview already sits on top
 * of the link itself.
 *
 * At the root, so every page inherits it. A product with a real photo sets its
 * own image and that wins (`products/[id]/page.tsx`).
 *
 * Built once at build time: nothing here reads a request.
 */
export const alt = SITE_SHARE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const POINTS = PROMISE.points.map((point) => point.title);

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: MARK.forest,
          padding: "64px 72px",
          fontFamily: "Bricolage",
          color: MARK.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 22, height: 22, borderRadius: 22, background: MARK.brightLime, marginRight: 16 }} />
          <div style={{ display: "flex", fontSize: 40, letterSpacing: -1 }}>MalFleks</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 84, lineHeight: 1.04, letterSpacing: -3 }}>Your money is held</div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 84, lineHeight: 1.04, letterSpacing: -3 }}>
            <span>until your order&nbsp;</span>
            <span style={{ fontFamily: "Instrument", fontStyle: "italic", fontSize: 96, letterSpacing: -2, color: MARK.brightLime }}>
              arrives
            </span>
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 38, letterSpacing: -0.5, color: MARK.mint }}>{PROMISE.swahili}</div>
        </div>

        <div style={{ display: "flex", borderTop: `2px solid ${MARK.hairline}`, paddingTop: 26 }}>
          {POINTS.map((point, index) => (
            <div key={point} style={{ display: "flex", alignItems: "center", marginRight: 30, fontSize: 22, color: MARK.muted }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  width: 30,
                  height: 30,
                  borderRadius: 30,
                  border: `2px solid ${MARK.hairline}`,
                  marginRight: 12,
                  fontSize: 16,
                  color: MARK.mint,
                }}
              >
                {index + 1}
              </div>
              {point}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: await shareFonts() },
  );
}
