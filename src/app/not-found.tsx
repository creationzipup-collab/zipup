import Link from "next/link";

import { DotLogo } from "@/components/brand/dot-logo";

/** 없는 주소 */
export default function NotFound() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-6 text-fg">
      <div className="flex w-full max-w-[560px] flex-col items-center text-center">
        <DotLogo lines="zipup" gap={6} radius={1.35} className="max-w-[420px] opacity-90" />
        <p className="mt-12 font-mono text-[11px] uppercase tracking-[0.24em] text-fg-4">404</p>
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.03em]">이 주소에는 아무것도 없어요</h1>
        <p className="mt-2 text-[14px] text-fg-3">주소가 바뀌었거나, 지워졌거나, 볼 권한이 없을 수 있어요.</p>
        <Link href="/" className="mt-8 inline-flex h-11 items-center rounded-xl bg-inv px-5 text-[14px] font-semibold text-inv-fg transition hover:opacity-90">
          홈으로
        </Link>
      </div>
    </main>
  );
}
