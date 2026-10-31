import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const heading = localFont({
  src: [
    { path: "../src/fonts/OldStandardTT-400.woff2", weight: "400", style: "normal" },
    { path: "../src/fonts/OldStandardTT-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-old-standard",
  display: "swap",
});
const sans = localFont({ src: "../src/fonts/IBMPlexSans.woff2", weight: "100 700", style: "normal", variable: "--font-plex-sans", display: "swap" });
const mono = localFont({
  src: [
    { path: "../src/fonts/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "../src/fonts/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

// Absolute URLs for the social images: PUBLIC_BASE_URL, else the Vercel production domain, else the production site.
const base = process.env.PUBLIC_BASE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://nocap-a5tx.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: "nocap: check what your coding agent says it did",
  description:
    "nocap reads your agent's final message, checks every claim against the diff and a real test run, and reverts the fix to prove new tests catch it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
