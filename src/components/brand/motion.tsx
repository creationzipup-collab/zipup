"use client";

import { motion, useInView } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 모션 도구 — 과한 장식 대신 숫자·등장·빛처럼 정보가 움직이는 곳에만 써요.
 * 모두 prefers-reduced-motion(앱 전체 MotionConfig)을 따라요.
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;

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

/** 스포트라이트 좌표 갱신 — className="spotlight"인 요소의 onPointerMove에 연결 (CSS 변수만 바꿔 리렌더 없음) */
export function trackSpotlight(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}
