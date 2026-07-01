import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Unbounded } from "next/font/google";
import "./globals.css";

// Space Grotesk carries all UI, body, and (crucially) the tabular numerals for
// the PIN, timers, and scores. Unbounded is the chunky arcade voice, reserved
// for the big moments — the wordmark, the podium, the "you're in".
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-unbounded",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "Quiz — live trivia, on the big screen",
    template: "%s · Quiz",
  },
  description:
    "A self-hosted, Kahoot-style live trivia game. Join from your phone with a 4-digit PIN and race your friends to answer fastest.",
  applicationName: "Quiz",
  openGraph: {
    title: "Quiz — live trivia, on the big screen",
    description:
      "Join from your phone with a 4-digit PIN and race your friends to answer fastest.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quiz — live trivia, on the big screen",
    description: "Join from your phone. Race to answer fastest.",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${unbounded.variable}`}>
      <body className="min-h-[100dvh] font-sans antialiased">
        <a
          href="#main"
          className="sr-only rounded-full bg-lime px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
