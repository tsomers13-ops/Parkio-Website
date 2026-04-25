import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "Parkio — Skip the lines. Own your day. Live Disney wait times.";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px",
          background:
            "radial-gradient(60% 50% at 20% 10%, rgba(99,102,241,0.35) 0%, transparent 60%)," +
            "radial-gradient(50% 40% at 80% 0%, rgba(56,189,248,0.30) 0%, transparent 60%)," +
            "radial-gradient(40% 40% at 50% 100%, rgba(244,114,182,0.25) 0%, transparent 60%)," +
            "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, #6366f1, #0ea5e9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 28px rgba(99,102,241,0.5)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 3l3 6 6 .9-4.5 4.4 1 6.2L12 17.8 6.5 20.5l1-6.2L3 9.9 9 9l3-6z"
                fill="white"
              />
            </svg>
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Parkio
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 92,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
            }}
          >
            Skip the Lines.
          </div>
          <div
            style={{
              fontSize: 92,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              background: "linear-gradient(135deg, #818cf8 0%, #38bdf8 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Own Your Day.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 28,
              color: "rgba(255,255,255,0.78)",
              maxWidth: 880,
              lineHeight: 1.35,
            }}
          >
            Live Disney wait times across all six U.S. parks. Updated every
            minute.
          </div>
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "rgba(255,255,255,0.7)",
            fontSize: 22,
          }}
        >
          <div style={{ display: "flex", gap: 24 }}>
            <span>parkio.info</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>6 parks</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>iPhone-first</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(16,185,129,0.18)",
              border: "1px solid rgba(16,185,129,0.45)",
              color: "#86efac",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "#34d399",
              }}
            />
            Live
          </div>
        </div>
      </div>
    ),
    size,
  );
}
