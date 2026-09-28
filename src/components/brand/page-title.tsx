import { cn } from "@/lib/utils";

/**
 * 페이지 제목: 모노 라벨 + 한글 제목 + 영문 세리프 이탤릭 한 줄.
 * 촬영장 어휘(ARCHIVE·PRODUCTIONS·SCRIPTS…)로 사이트 전체의 말투를 맞춰요.
 */
export function PageTitle({
  label,
  title,
  accent,
  subtitle,
  actions,
  className,
}: {
  label: string;
  title: React.ReactNode;
  accent?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0 animate-fade-up">
        <p className="section-index flex items-center gap-2 uppercase">
          <span className="h-px w-5 bg-accent" />
          {label}
        </p>
        <h1 className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[26px] font-semibold leading-tight tracking-[-0.03em]">
          {title}
          {accent && <span className="font-serif text-[25px] font-normal italic tracking-[-0.01em] text-fg-3">{accent}</span>}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-fg-3">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
