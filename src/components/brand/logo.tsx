import { cn } from "@/lib/utils";

/**
 * CREATION ZIPUP 로고 (원본 이미지를 보고 벡터로 재현)
 * 원본 SVG/AI 파일이 있으면 public/brand/ 에 넣고 이 컴포넌트를 교체하세요.
 */

const ZIPUP_PATHS = [
  // Z
  "M0,0 H97 A40,40 0 0 1 137,40 V126 A10,10 0 0 0 147,136 H240 V152 H145 A40,40 0 0 1 105,112 V25 A10,10 0 0 0 95,15 H0 Z",
  // I
  "M262,0 H295 V152 H262 Z",
  // P
  "M318,0 H502 A38,38 0 0 1 540,38 V44 A38,38 0 0 1 502,82 H361 A10,10 0 0 0 351,92 V152 H318 V106 A40,40 0 0 1 358,66 H496 A12,12 0 0 0 508,54 V27 A12,12 0 0 0 496,15 H318 Z",
  // U
  "M562,0 H595 V124 A12,12 0 0 0 607,136 H740 A12,12 0 0 0 752,124 V0 H785 V112 A40,40 0 0 1 745,152 H602 A40,40 0 0 1 562,112 Z",
  // P
  "M808,0 H992 A38,38 0 0 1 1030,38 V44 A38,38 0 0 1 992,82 H851 A10,10 0 0 0 841,92 V152 H808 V106 A40,40 0 0 1 848,66 H986 A12,12 0 0 0 998,54 V27 A12,12 0 0 0 986,15 H808 Z",
];

const CREATION_PATHS = [
  // C
  "M130,0 H22 A22,22 0 0 0 0,22 V66 A22,22 0 0 0 22,88 H130 V72 H24 A8,8 0 0 1 16,64 V24 A8,8 0 0 1 24,16 H130 Z",
  // R
  "M143,0 H243 A22,22 0 0 1 265,22 V28 A22,22 0 0 1 243,50 H229 L265,88 H245 L209,50 H167 A8,8 0 0 0 159,58 V88 H143 V56 A22,22 0 0 1 165,34 H241 A8,8 0 0 0 249,26 V24 A8,8 0 0 0 241,16 H143 Z",
  // E
  "M413,0 H305 A22,22 0 0 0 283,22 V66 A22,22 0 0 0 305,88 H413 V72 H307 A8,8 0 0 1 299,64 V52 H400 V36 H299 V24 A8,8 0 0 1 307,16 H413 Z",
  // A
  "M424,88 L481,4 Q491,-3 501,4 L559,88 H539 L525,68 H458 L444,88 Z M491,18 L514,52 H468 Z",
  // T
  "M570,0 H710 V16 H648 V88 H632 V16 H570 Z",
  // I
  "M723,0 H740 V88 H723 Z",
  // O
  "M776,0 H860 A22,22 0 0 1 882,22 V66 A22,22 0 0 1 860,88 H776 A22,22 0 0 1 754,66 V22 A22,22 0 0 1 776,0 Z M778,16 A8,8 0 0 0 770,24 V64 A8,8 0 0 0 778,72 H858 A8,8 0 0 0 866,64 V24 A8,8 0 0 0 858,16 Z",
  // N (겹치는 획은 별도 path로 그려 evenodd 구멍이 생기지 않게)
  "M897,0 H913 V88 H897 Z",
  "M897,0 H919 L1030,76 V88 H1008 L897,12 Z",
  "M1014,0 H1030 V88 H1014 Z",
];

/** 두 줄 전체 로고 (CREATION / ZIPUP) */
export function LogoFull({ className, title = "CREATION ZIPUP" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 1030 273" className={cn("h-auto", className)} role="img" aria-label={title} fill="currentColor">
      <title>{title}</title>
      <g fillRule="evenodd">
        {CREATION_PATHS.map((d, i) => (
          <path key={`c${i}`} d={d} />
        ))}
      </g>
      <g transform="translate(0 121)">
        {ZIPUP_PATHS.map((d, i) => (
          <path key={`z${i}`} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** ZIPUP 워드마크 */
export function LogoZipup({ className, title = "ZIPUP" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 1030 152" className={cn("h-auto", className)} role="img" aria-label={title} fill="currentColor">
      <title>{title}</title>
      {ZIPUP_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** Z 심볼 (파비콘·아바타용) */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="-24 -24 288 200" className={cn("h-auto", className)} aria-hidden fill="currentColor">
      <path d={ZIPUP_PATHS[0]} />
    </svg>
  );
}

/** 사이드바용 ZIPUP AI 락업 */
export function BrandLockup({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      {compact ? (
        <LogoMark className="w-7" />
      ) : (
        <>
          <LogoZipup className="w-[76px]" />
          <span className="rounded-md border border-line-2 px-1.5 py-[1px] font-mono text-[10px] font-semibold tracking-[0.18em] text-fg-2">
            AI
          </span>
        </>
      )}
    </span>
  );
}
