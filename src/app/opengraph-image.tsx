import { ImageResponse } from "next/og";

// The share card: dark stage, the four arcade shapes, a lime wordmark. Rendered
// on demand so it never goes stale.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Quiz — live trivia, on the big screen";

export default function OpengraphImage() {
  const shapes: React.ReactNode[] = [
    <div key="t" style={{ width: 0, height: 0, borderLeft: "34px solid transparent", borderRight: "34px solid transparent", borderBottom: "60px solid #f0335f" }} />,
    <div key="d" style={{ width: 60, height: 60, background: "#2f93e6", transform: "rotate(45deg)" }} />,
    <div key="c" style={{ width: 64, height: 64, borderRadius: 999, background: "#f5a916" }} />,
    <div key="s" style={{ width: 60, height: 60, borderRadius: 10, background: "#1fc06e" }} />,
  ];

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
          gap: 48,
          background: "#08080c",
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, rgba(194,242,56,0.14), transparent 70%)",
        }}
      >
        <div style={{ display: "flex", gap: 40 }}>{shapes}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 132, fontWeight: 800, color: "#c2f238", letterSpacing: -4 }}>
            QUIZ
          </div>
          <div style={{ fontSize: 34, color: "#a6a6c0", marginTop: 4 }}>
            Live trivia, on the big screen
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
