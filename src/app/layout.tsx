import { GeistMono } from "geist/font/mono";
import { GeistPixelCircle } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ZIPUP AI", template: "%s · ZIPUP AI" },
  description: "CREATION ZIPUP 사내 제작 시스템",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${GeistMono.variable} ${GeistSans.variable} ${GeistPixelCircle.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
