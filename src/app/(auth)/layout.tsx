import { DotLogo } from "@/components/brand/dot-logo";
import { BRAND } from "@/lib/brand";

/** 로그인·가입: 왼쪽은 점으로 된 로고(커서를 대면 흩어졌다 돌아와요)와 회사 소개 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.25fr_1fr]">
      <aside data-theme="dark" className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-[#060607] p-10 text-fg lg:flex xl:p-14">
        <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-3">
          <span>{BRAND.name}</span>
          <span>Internal production system</span>
        </div>

        <DotLogo className="my-10 max-w-[760px]" gap={6} radius={1.45} />

        <div className="grid gap-8 border-t border-line pt-6 xl:grid-cols-[140px_1fr]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-4">About</span>
          <div className="flex max-w-xl flex-col gap-3 break-keep text-[14px] leading-[1.75] text-fg-2">
            {BRAND.about.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </aside>

      {/* 폼 */}
      <main className="relative flex items-center justify-center px-5 py-12">
        <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-line px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-4 lg:hidden">
          <span>{BRAND.name}</span>
          <span>AI · 3D</span>
        </div>
        <div className="w-full max-w-[380px] animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
