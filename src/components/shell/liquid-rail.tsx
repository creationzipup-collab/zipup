"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import * as React from "react";

/**
 * 메뉴 왼쪽의 가는 선. 지금 페이지 쪽으로 부드럽게 휘어 있고, 마우스를 올리면 그 메뉴로 흘러가요.
 * 메뉴(부모 요소) 안에 넣고, 메뉴 항목에는 data-rail-key를 붙여요.
 */
export function LiquidRail({ activeKey }: { activeKey: string | null }) {
  const reduce = useReducedMotion();
  const self = React.useRef<HTMLSpanElement>(null);
  // 부모(메뉴) 요소 — 자기 ref는 부모 ref보다 먼저 붙어서 첫 측정에서도 안전해요
  const container = React.useMemo(() => ({ get current() { return self.current?.parentElement ?? null; } }), []);
  const [height, setHeight] = React.useState(0);
  const y = useSpring(0, { stiffness: 210, damping: 24, mass: 0.7 });
  const bulge = useSpring(0, { stiffness: 220, damping: 20 });
  const hoverKey = React.useRef<string | null>(null);

  const centerOf = React.useCallback(
    (key: string | null) => {
      const el = key ? container.current?.querySelector<HTMLElement>(`[data-rail-key="${CSS.escape(key)}"]`) : null;
      return el ? el.offsetTop + el.offsetHeight / 2 : null;
    },
    [container],
  );

  const moveTo = React.useCallback(
    (key: string | null, jump = false) => {
      const c = centerOf(key);
      if (c === null) {
        bulge.set(0);
        return;
      }
      if (jump || reduce) y.jump(c);
      else y.set(c);
      bulge.set(1);
    },
    [centerOf, y, bulge, reduce],
  );

  // 크기·활성 메뉴가 바뀌면 다시 재기
  React.useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => {
      setHeight(el.offsetHeight);
      moveTo(hoverKey.current ?? activeKey, !y.get());
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [container, activeKey, moveTo, y]);

  // 마우스를 따라 흐르기
  React.useEffect(() => {
    const el = container.current;
    if (!el) return;
    const over = (e: PointerEvent) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>("[data-rail-key]");
      const key = item?.dataset.railKey ?? null;
      if (key && key !== hoverKey.current) {
        hoverKey.current = key;
        moveTo(key);
      }
    };
    const leave = () => {
      hoverKey.current = null;
      moveTo(activeKey);
    };
    el.addEventListener("pointerover", over);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointerover", over);
      el.removeEventListener("pointerleave", leave);
    };
  }, [container, activeKey, moveTo]);

  const R = 20;
  const X = 1.5;
  const full = useTransform([y, bulge], ([c, b]: number[]) => {
    const out = X + 8 * b;
    return `M ${X} 0 L ${X} ${c - R} C ${X} ${c - R / 2}, ${out} ${c - R / 2}, ${out} ${c} C ${out} ${c + R / 2}, ${X} ${c + R / 2}, ${X} ${c + R} L ${X} ${Math.max(height, c + R)}`;
  });
  const lit = useTransform([y, bulge], ([c, b]: number[]) => {
    const out = X + 8 * b;
    return `M ${X} ${c - R} C ${X} ${c - R / 2}, ${out} ${c - R / 2}, ${out} ${c} C ${out} ${c + R / 2}, ${X} ${c + R / 2}, ${X} ${c + R}`;
  });
  const dotX = useTransform(bulge, (b) => X + 8 * b);
  const dotOpacity = useTransform(bulge, (b) => b);

  return (
    <span ref={self} aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[14px]">
      {height > 0 && (
        <svg className="absolute left-0 top-0 overflow-visible" width={14} height={height}>
          <motion.path d={full} fill="none" stroke="var(--line-2)" strokeWidth={1} />
          <motion.path d={lit} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px var(--accent))" }} />
          <motion.circle cx={dotX} cy={y} r={2.2} fill="var(--accent)" style={{ opacity: dotOpacity }} />
        </svg>
      )}
    </span>
  );
}
