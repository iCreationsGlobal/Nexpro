import { ImageResponse } from "next/og";

export const alt = "African Business Suite - Business Management Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#166534",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "white",
            marginBottom: 16,
          }}
        >
          African Business Suite
        </div>
        <div
          style={{
            fontSize: 28,
            color: "rgba(163, 230, 53, 1)",
            marginBottom: 8,
          }}
        >
          African Business Suite
        </div>
        <div
          style={{
            fontSize: 22,
            color: "rgba(255, 255, 255, 0.9)",
            maxWidth: 600,
            textAlign: "center",
          }}
        >
          Business management for Shops, Pharmacies &amp; Printing Studios
        </div>
      </div>
    ),
    { ...size }
  );
}
