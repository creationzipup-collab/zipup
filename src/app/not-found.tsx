import Link from "next/link";

import { Magnetic, Viewfinder, ViewportGrid } from "@/components/brand/motion";

/** 없는 주소: 편집에서 빠진 장면 */
export default function NotFound() {
  return (
    <main data-theme="dark" className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-[#050506] px-6 text-fg">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 size-[560px] animate-drift rounded-full bg-[#ff5b24] opacity-[0.18] blur-[140px]" />
        <div className="absolute -bottom-52 -right-24 size-[560px] animate-drift-slow rounded-full bg-[#3a2cff] opacity-[0.24] blur-[150px]" />
        <ViewportGrid />
        <div className="grain-live" />
      </div>
      <Viewfinder inset={24} cross={false} className="text-white/25" />
      <div className="relative animate-fade-up text-center">
        <p className="section-index uppercase">Scene 404 · Take —</p>
        <h1 className="mt-4 font-serif text-[120px] italic leading-none tracking-[-0.03em] sm:text-[160px]">Cut.</h1>
        <p className="mt-5 text-[17px] font-medium text-fg">찾는 장면이 편집에서 빠졌어요.</p>
        <p className="mt-1 text-sm text-fg-3">주소가 바뀌었거나, 지워졌거나, 볼 권한이 없을 수 있어요.</p>
        <Magnetic className="mt-8">
          <Link href="/" className="inline-flex h-11 items-center gap-2 rounded-xl bg-inv px-5 text-[14px] font-semibold text-inv-fg transition hover:opacity-90">
            스튜디오로 돌아가기
          </Link>
        </Magnetic>
      </div>
    </main>
  );
}
