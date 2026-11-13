import { ImageResponse } from "next/og"

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site"

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// The card shown when a link to the app is shared.
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background:
          "radial-gradient(900px 500px at 50% 0%, #312e81 0%, #09090d 70%)",
        color: "#f4f4f5",
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 700, color: "#a5b4fc" }}>
        {SITE_NAME}
      </div>
      <div
        style={{
          marginTop: 24,
          fontSize: 76,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: -2,
        }}
      >
        Hand your recurring work to AI bots with their own computers
      </div>
      <div style={{ marginTop: 32, fontSize: 32, color: "#a1a1aa" }}>
        Scheduled automations · your own devices · results where you work
      </div>
    </div>,
    size
  )
}
