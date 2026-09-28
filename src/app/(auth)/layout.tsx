import { LogoFull } from "@/components/brand/logo";

const MODELS = ["Seedream 5.0 Pro", "Nano Banana Pro", "Nano Banana 2", "GPT Image 2.5", "GPT Image 2", "MiniMax H3", "Seedance 2.5"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grain relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* 비주얼 패널 */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-[#050506] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-[-10%] size-[620px] rounded-full bg-[#ff5b24] opacity-[0.22] blur-[140px]" />
          <div className="absolute bottom-[-25%] right-[-10%] size-[560px] rounded-full bg-[#3a2cff] opacity-[0.28] blur-[150px]" />
          <div className="absolute left-[35%] top-[40%] size-[380px] rounded-full bg-[#7cf7ff] opacity-[0.10] blur-[120px]" />
          <div className="dot-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        </div>

        <div className="relative flex items-center gap-3 text-white/70">
          <span className="eyebrow !text-white/50">Internal AI Studio</span>
          <span className="h-px flex-1 bg-white/10" />
          <span className="eyebrow !text-white/50">v1.0</span>
        </div>

        <div className="relative flex flex-col gap-10">
          <LogoFull className="w-[min(440px,80%)] text-white" />
          <div className="flex flex-col gap-4">
            <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.03em] text-white">
              상상한 장면을,
              <br />
              <span className="bg-gradient-to-r from-white via-white/80 to-[#ff8a5c] bg-clip-text text-transparent">
                바로 만들어요.
              </span>
            </h1>
            <p className="max-w-md text-[15px] leading-relaxed text-white/55">
              최신 이미지·영상 모델을 한곳에서. 팀과 프로젝트를 공유하고, 별점과 태그로 셀렉하고, 노드로 워크플로를 짜보세요.
            </p>
          </div>
          <div className="flex max-w-lg flex-wrap gap-2">
            {MODELS.map((m) => (
              <span
                key={m}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/70 backdrop-blur"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/35">CREATION ZIPUP 구성원 전용 · 관리자 승인 후 이용할 수 있어요</p>
      </aside>

      {/* 폼 */}
      <main className="relative flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px] animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
