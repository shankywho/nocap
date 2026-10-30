import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const display = localFont({ src: "../src/fonts/Bricolage.woff2", variable: "--font-bricolage", weight: "200 800", display: "swap" });
const serif = localFont({
  src: [
    { path: "../src/fonts/Newsreader.woff2", style: "normal", weight: "200 800" },
    { path: "../src/fonts/Newsreader-Italic.woff2", style: "italic", weight: "200 800" },
  ],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "nocap — your agent says it's done. nocap checks.",
  description:
    "nocap verifies every claim in your coding agent's summary against the diff and real test runs, then sends every false claim back until the agent proves it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
