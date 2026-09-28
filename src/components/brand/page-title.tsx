import { cn } from "@/lib/utils";

/**
 * 페이지 제목: 작은 모노 라벨 + 제목 + 한 줄 설명. 모든 페이지가 같은 모양으로 시작해요.
 */
export function PageTitle({
  label,
  title,
  subtitle,
  actions,
  className,
}: {
  label: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5", className)}>
      <div className="min-w-0 animate-fade-up">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-4">{label}</p>
        <h1 className="mt-2.5 text-[30px] font-semibold leading-none tracking-[-0.035em]">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-fg-3">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
