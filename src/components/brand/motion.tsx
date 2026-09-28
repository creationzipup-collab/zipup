"use client";

import { animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 브랜드 모션 도구 모음 — 영상 디렉터 집단답게 "촬영장" 어휘로 움직임을 통일해요.
 * 모두 prefers-reduced-motion을 따르고, 보이는 동안에만 움직여요.
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;

/* ---------------------------------- 나타나기 ---------------------------------- */

/** 화면에 들어올 때 한 번 떠오르기 */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

/** 단어마다 마스크 밖에서 올라오는 제목 */
export function SplitWords({ text, className, delay = 0, stagger = 0.06 }: { text: string; className?: string; delay?: number; stagger?: number }) {
  const words = text.split(/(\s+)/);
  let i = 0;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {words.map((w, k) => {
        if (/^\s+$/.test(w)) return <React.Fragment key={k}>{w}</React.Fragment>;
        const d = delay + stagger * i++;
        return (
          <span key={k} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span className="inline-block" initial={{ y: "105%" }} animate={{ y: "0%" }} transition={{ duration: 0.8, delay: d, ease: EASE }}>
              {w}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** 여러 줄을 번갈아 보여주기 (매니페스토 자막) */
export function CyclingLines({ lines, interval = 3600, className }: { lines: React.ReactNode[]; interval?: number; className?: string }) {
  const [i, setI] = React.useState(0);
  const reduce = useReducedMotion();
  React.useEffect(() => {
    if (lines.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), interval);
    return () => clearInterval(t);
  }, [lines.length, interval]);
  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={i}
          className="block"
          initial={reduce ? { opacity: 0 } : { y: "70%", opacity: 0, filter: "blur(6px)" }}
          animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { y: "-60%", opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          {lines[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ---------------------------------- 숫자 ---------------------------------- */

/** 보일 때 0에서 목표값까지 올라가는 숫자 (React가 가진 글자 노드를 그대로 고쳐 써서 리렌더 없음) */
export function CountUp({ value, className, duration = 1.4, format }: { value: number; className?: string; duration?: number; format?: (n: number) => string }) {
  const box = React.useRef<HTMLSpanElement>(null);
  const text = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(box, { once: true });
  const fmt = React.useCallback((n: number) => (format ? format(n) : Math.round(n).toLocaleString("ko-KR")), [format]);
  React.useEffect(() => {
    const node = text.current?.firstChild;
    if (!node || !inView) return;
    const write = (n: number) => {
      node.nodeValue = fmt(n);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      write(value);
      return;
    }
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: write });
    return () => controls.stop();
  }, [inView, value, duration, fmt]);
  return (
    <span ref={box} className={cn("tabular-nums", className)}>
      <span ref={text}>{fmt(0)}</span>
    </span>
  );
}

/**
 * 자리마다 굴러가며 바뀌는 숫자 (오도미터). 처음 보일 때 0에서 굴러 올라오고, 값이 바뀌면 그 자리만 굴러요.
 */
export function RollingNumber({ value, className, format }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -5% 0px" });
  const text = format ? format(value) : Math.round(value).toLocaleString("ko-KR");
  const shown = inView ? text : text.replace(/\d/g, "0");
  const chars = shown.split("");
  return (
    <span ref={ref} className={cn("inline-flex items-baseline tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <Digit key={`d${chars.length - i}`} d={Number(ch)} delay={(chars.length - i) * 0.04} />
        ) : (
          <span key={`s${chars.length - i}`} aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ d, delay }: { d: number; delay: number }) {
  return (
    <span aria-hidden className="relative inline-block h-[1.08em] overflow-hidden align-baseline leading-[1.08em]">
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-d * 1.08}em` }}
        transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.9, delay }}
      >
        {DIGITS.map((n) => (
          <span key={n} className="block h-[1.08em] text-center">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/* ---------------------------------- 촬영장 소품 ---------------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 촬영 타임코드 HH:MM:SS:FF (24fps, 한국 시간). 렌더 없이 글자만 바꿔서 가벼워요.
 */
export function Timecode({ className, fps = 24 }: { className?: string; fps?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = "";
    const tick = () => {
      const now = Date.now() + 9 * 3600_000;
      const d = new Date(now);
      const frame = still ? 0 : Math.floor(((now % 1000) / 1000) * fps);
      const s = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}:${pad(frame)}`;
      if (s !== last) el.textContent = last = s;
      raf = still ? window.setTimeout(tick, 1000) : requestAnimationFrame(tick);
    };
    tick();
    return () => (still ? clearTimeout(raf) : cancelAnimationFrame(raf));
  }, [fps]);
  return <span ref={ref} className={cn("font-mono tabular-nums", className)} suppressHydrationWarning />;
}

/** 녹화 중 빨간 점 */
export function RecDot({ className, label = "REC" }: { className?: string; label?: string | null }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-[0.2em]", className)}>
      <span className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#ff3b30] opacity-50 motion-reduce:hidden" />
        <span className="relative size-2 rounded-full bg-[#ff3b30] shadow-[0_0_10px_#ff3b30]" />
      </span>
      {label}
    </span>
  );
}

/**
 * 무한으로 흐르는 띠 (쇼릴·크레딧). 마우스를 올리면 멈춰요. 두 번째 복제본은 스크린리더에서 빠지고,
 * 링크가 있으면 함수형 children으로 복제본의 탭 이동도 뺄 수 있어요.
 */
export function Marquee({
  children,
  className,
  duration = 60,
  reverse = false,
}: {
  children: React.ReactNode | ((clone: boolean) => React.ReactNode);
  className?: string;
  duration?: number;
  reverse?: boolean;
}) {
  return (
    <div className={cn("marquee relative flex overflow-hidden", className)} style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}>
      {[false, true].map((clone) => (
        <div key={String(clone)} aria-hidden={clone || undefined} className={cn("marquee-track flex shrink-0 items-stretch", reverse && "[animation-direction:reverse]")}>
          {typeof children === "function" ? children(clone) : children}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- 손맛 ---------------------------------- */

/** 스포트라이트 좌표 갱신 — className="spotlight"인 요소의 onPointerMove에 연결 (CSS 변수만 바꿔 리렌더 없음) */
export function trackSpotlight(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/** 커서 쪽으로 살짝 끌려오는 요소 (주요 버튼용) */
export function Magnetic({ children, strength = 0.22, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 });
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn("inline-flex", className)}
      style={reduce ? undefined : { x: sx, y: sy }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------- 뷰파인더 ---------------------------------- */

/** 카메라 뷰파인더 모서리 가이드 + 가운데 십자 */
export function Viewfinder({ className, cross = true, inset = 20 }: { className?: string; cross?: boolean; inset?: number }) {
  const corner = "absolute size-5 border-current";
  return (
    <div aria-hidden className={cn("pointer-events-none absolute text-white/40", className)} style={{ inset }}>
      <span className={cn(corner, "left-0 top-0 border-l border-t")} />
      <span className={cn(corner, "right-0 top-0 border-r border-t")} />
      <span className={cn(corner, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(corner, "bottom-0 right-0 border-b border-r")} />
      {cross && (
        <span className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 opacity-70">
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current" />
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
        </span>
      )}
    </div>
  );
}

/** 3D 툴 뷰포트처럼 원근으로 깔린 바닥 그리드 */
export function ViewportGrid({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("viewport-grid pointer-events-none absolute inset-x-0 bottom-0 h-[55%] overflow-hidden", className)}>
      <div className="viewport-grid-plane" />
    </div>
  );
}

/** 3D 툴의 축 표시 (X·Y·Z) */
export function AxisGizmo({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 44 44" className={cn("size-11", className)}>
      <g strokeWidth="1.6" strokeLinecap="round">
        <line x1="14" y1="30" x2="36" y2="30" stroke="#ff4d4f" />
        <line x1="14" y1="30" x2="14" y2="8" stroke="#3dd68c" />
        <line x1="14" y1="30" x2="4" y2="40" stroke="#4c8dff" />
      </g>
      <g fontFamily="var(--font-mono)" fontSize="6" fontWeight="600">
        <text x="38" y="32" fill="#ff4d4f">X</text>
        <text x="12" y="6" fill="#3dd68c">Y</text>
        <text x="0" y="44" fill="#4c8dff">Z</text>
      </g>
      <circle cx="14" cy="30" r="1.8" fill="currentColor" />
    </svg>
  );
}
