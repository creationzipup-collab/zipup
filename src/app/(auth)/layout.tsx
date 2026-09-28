import { LogoFull } from "@/components/brand/logo";
import { AxisGizmo, CyclingLines, Marquee, RecDot, SplitWords, Timecode, Viewfinder, ViewportGrid } from "@/components/brand/motion";
import { BRAND } from "@/lib/brand";

const MODELS = ["Seedream 5.0 Pro", "Nano Banana Pro", "Nano Banana 2", "GPT Image 2.5", "GPT Image 2", "MiniMax H3", "Seedance 2.5"];

/** 로그인·가입: 왼쪽은 카메라 모니터처럼 (레터박스 · 뷰파인더 · 3D 바닥 그리드) */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <aside data-theme="dark" className="relative isolate hidden overflow-hidden border-r border-line bg-[#050506] text-fg lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-40 top-[-12%] size-[640px] animate-drift rounded-full bg-[#ff5b24] opacity-[0.24] blur-[140px]" />
          <div className="absolute bottom-[-28%] right-[-12%] size-[600px] animate-drift-slow rounded-full bg-[#3a2cff] opacity-[0.3] blur-[150px]" />
          <div className="absolute left-[38%] top-[38%] size-[360px] animate-drift rounded-full bg-[#7cf7ff] opacity-[0.08] blur-[120px]" />
          <ViewportGrid className="opacity-90" />
          <div className="grain-live" />
        </div>

        {/* 위 레터박스: 녹화 표시 · 타임코드 */}
        <div className="flex h-14 shrink-0 items-center gap-5 border-b border-white/[0.06] bg-black/70 px-8 font-mono text-[10.5px] uppercase tracking-[0.2em] text-white/45 backdrop-blur">
          <RecDot className="text-[#ff6b61]" />
          <Timecode className="text-[12px] tracking-[0.08em] text-white/80" />
          <span className="ml-auto">Internal Studio</span>
          <span className="text-white/25">v1.0</span>
        </div>

        {/* 화면 */}
        <div className="relative flex min-h-0 flex-1 flex-col justify-center px-12 py-10 xl:px-16">
          <Viewfinder inset={22} cross={false} className="text-white/25" />
          <AxisGizmo className="absolute bottom-8 left-8 size-10 text-white/50" />

          <div className="relative flex max-w-[640px] flex-col gap-9">
            <LogoFull className="w-[min(460px,82%)] animate-fade-up text-white" />
            <div className="flex flex-col gap-4">
              <h1 className="text-[42px] font-semibold leading-[1.08] tracking-[-0.04em] text-white">
                <SplitWords text="상상한 장면을," delay={0.1} />
                <br />
                <SplitWords text="바로 만들어요." delay={0.28} className="text-white/70" />
              </h1>
              <CyclingLines className="font-serif text-[28px] italic leading-tight text-[#ff8a5c]" lines={[...BRAND.taglines]} />
              <p className="max-w-md break-keep text-[14.5px] leading-relaxed text-white/55">{BRAND.statement}</p>
            </div>
          </div>
        </div>

        {/* 아래 레터박스: 모델 띠 */}
        <div className="shrink-0 border-t border-white/[0.06] bg-black/70 backdrop-blur">
          <Marquee duration={38} className="py-3 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
            {MODELS.map((m) => (
              <span key={m} className="mx-4 inline-flex items-center gap-2 whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/45">
                <span className="size-1 rounded-full bg-[#ff5b24]" />
                {m}
              </span>
            ))}
          </Marquee>
          <p className="flex items-center justify-between border-t border-white/[0.06] px-8 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
            <span>{BRAND.name} — {BRAND.role}</span>
            <span className="normal-case tracking-normal">구성원 전용 · 관리자 승인 후 이용</span>
          </p>
        </div>
      </aside>

      {/* 폼 */}
      <main className="relative flex items-center justify-center overflow-hidden px-5 py-12">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-accent opacity-[0.06] blur-[120px]" />
        {/* 모바일: 위쪽 슬레이트 줄 */}
        <div className="absolute inset-x-0 top-0 flex items-center gap-4 border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-4 lg:hidden">
          <RecDot className="text-[#ff6b61]" />
          <Timecode className="text-[11px] tracking-[0.08em] text-fg-2" />
          <span className="ml-auto">{BRAND.name}</span>
        </div>
        <div className="w-full max-w-[400px] animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
