import "./globals.css";

import type { Metadata } from "next";
import { IBM_Plex_Mono, Press_Start_2P, VT323 } from "next/font/google";

const headingFont = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-heading"
});

const bodyFont = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-body"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "BotJam",
  description: "Song-synced AI live coding stage"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>{children}</body>
    </html>
  );
}
