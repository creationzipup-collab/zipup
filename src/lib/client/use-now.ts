"use client";

import { useSyncExternalStore } from "react";

/**
 * 주기적으로 갱신되는 현재 시각 (ms).
 * 같은 주기를 쓰는 컴포넌트끼리 타이머 하나를 공유하고,
 * 서버 렌더링·하이드레이션 중에는 0을 돌려줘 불일치를 막아요.
 * (subscribe/getSnapshot은 주기별로 같은 함수를 써야 React가 매 렌더마다 다시 구독하지 않아요)
 */
type Clock = {
  now: number;
  subs: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
};
const clocks = new Map<number, Clock>();

function clockFor(ms: number): Clock {
  const existing = clocks.get(ms);
  if (existing) return existing;
  const c: Clock = {
    now: Date.now(),
    subs: new Set(),
    timer: null,
    subscribe: (onChange) => {
      c.subs.add(onChange);
      if (!c.timer) {
        c.timer = setInterval(() => {
          c.now = Date.now();
          c.subs.forEach((f) => f());
        }, ms);
        // 한동안 멈춰 있었다면 바로 한 번 갱신
        if (Date.now() - c.now >= ms) {
          queueMicrotask(() => {
            c.now = Date.now();
            c.subs.forEach((f) => f());
          });
        }
      }
      return () => {
        c.subs.delete(onChange);
        if (!c.subs.size && c.timer) {
          clearInterval(c.timer);
          c.timer = null;
        }
      };
    },
    getSnapshot: () => c.now,
  };
  clocks.set(ms, c);
  return c;
}

const serverSnapshot = () => 0;

export function useNow(intervalMs = 1000): number {
  const c = clockFor(intervalMs);
  return useSyncExternalStore(c.subscribe, c.getSnapshot, serverSnapshot);
}
