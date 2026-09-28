"use client";

import { useSyncExternalStore } from "react";

/**
 * 주기적으로 갱신되는 현재 시각 (ms).
 * 같은 주기를 쓰는 컴포넌트끼리 타이머 하나를 공유하고,
 * 서버 렌더링·하이드레이션 중에는 0을 돌려줘 불일치를 막아요.
 */
type Clock = { now: number; subs: Set<() => void>; timer: ReturnType<typeof setInterval> | null };
const clocks = new Map<number, Clock>();

function clockFor(ms: number): Clock {
  let c = clocks.get(ms);
  if (!c) {
    c = { now: Date.now(), subs: new Set(), timer: null };
    clocks.set(ms, c);
  }
  return c;
}

export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(
    (onChange) => {
      const c = clockFor(intervalMs);
      c.subs.add(onChange);
      if (!c.timer) {
        c.now = Date.now();
        c.timer = setInterval(() => {
          c.now = Date.now();
          c.subs.forEach((f) => f());
        }, intervalMs);
        queueMicrotask(onChange);
      }
      return () => {
        c.subs.delete(onChange);
        if (!c.subs.size && c.timer) {
          clearInterval(c.timer);
          c.timer = null;
        }
      };
    },
    () => clockFor(intervalMs).now,
    () => 0,
  );
}
