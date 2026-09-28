import { GeistMono } from "geist/font/mono";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";

import { Providers } from "@/components/providers";

import "./globals.css";

/** 영문 강조용 세리프 (Instrument Serif, OFL) — 로컬 파일이라 빌드가 외부 폰트 서버에 기대지 않아요 */
const serif = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.woff2", style: "normal", weight: "400" },
    { path: "./fonts/InstrumentSerif-Italic.woff2", style: "italic", weight: "400" },
  ],
  variable: "--font-serif-latin",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "ZIPUP AI", template: "%s · ZIPUP AI" },
  description: "CREATION ZIPUP — AI와 3D로 영상을 만드는 디렉터 집단의 사내 제작 스튜디오",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070708" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f3" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("zipup-theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="ko" data-theme={theme} className={`${GeistMono.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
