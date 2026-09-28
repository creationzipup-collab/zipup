/** 페이지를 불러오는 동안: 필름 리더 카운트다운 (빠르게 열리면 보이지 않도록 살짝 늦게 나타나요) */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center">
      <div role="status" aria-label="불러오는 중" className="film-leader flex flex-col items-center gap-4">
        <div className="relative size-24 text-fg-4">
          <div className="absolute inset-0 animate-spin rounded-full motion-reduce:animate-none bg-[conic-gradient(from_0deg,color-mix(in_oklab,var(--accent)_38%,transparent),transparent_32%)] [animation-duration:1s]" />
          <div className="absolute inset-0 rounded-full border border-line-3" />
          <div className="absolute inset-[9px] rounded-full border border-line-2" />
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line-2" />
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-line-2" />
          {[3, 2, 1].map((n, i) => (
            <span key={n} className="film-leader-num absolute inset-0 flex items-center justify-center font-serif text-[46px] italic text-fg" style={{ animationDelay: `${i}s` }}>
              {n}
            </span>
          ))}
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.26em] text-fg-4">Rolling</span>
      </div>
    </div>
  );
}
