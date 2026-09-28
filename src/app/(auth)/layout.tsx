import { AmbientVideo } from "@/components/brand/ambient-video";
import { DotLogo } from "@/components/brand/dot-logo";
import { BRAND } from "@/lib/brand";

/** 로그인·가입: 결과물 영상을 어둡게 깔고, 왼쪽엔 점으로 된 로고와 회사 소개, 오른쪽엔 유리 패널 폼 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <AmbientVideo shade="none" className="-z-20" videoClassName="scale-[1.04]" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(5_7_10/0.94)_0%,rgb(5_7_10/0.8)_48%,rgb(5_7_10/0.6)_100%)]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-t from-bg to-transparent" />

      <div className="grid min-h-dvh lg:grid-cols-[1.25fr_1fr]">
        <aside className="relative hidden flex-col justify-between p-10 text-fg lg:flex xl:p-14">
          <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-3">
            <span>{BRAND.name}</span>
            <span>Internal production system</span>
          </div>

          <DotLogo className="my-10 max-w-[760px]" gap={6} radius={1.45} />

          <div className="grid gap-8 border-t border-white/10 pt-6 xl:grid-cols-[140px_1fr]">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-4">About</span>
            <div className="flex max-w-xl flex-col gap-3 break-keep text-[14px] leading-[1.75] text-fg-2">
              {BRAND.about.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </aside>

        {/* 폼 */}
        <main className="relative flex items-center justify-center px-5 py-16">
          <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/10 px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-4 lg:hidden">
            <span>{BRAND.name}</span>
            <span>AI · 3D</span>
          </div>
          <div className="glass-strong corners w-full max-w-[400px] animate-fade-up rounded-[20px] p-7 shadow-[var(--shadow-pop)] sm:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
