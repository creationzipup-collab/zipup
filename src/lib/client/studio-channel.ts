"use client";

import * as React from "react";

import type { GenerationDTO } from "@/lib/client/generations";

/**
 * 듀얼 모니터: 프롬프트 창 ↔ 결과 창 통신 (같은 브라우저의 BroadcastChannel)
 * - 결과 창은 2초마다 살아 있다고 알림 → 프롬프트 창은 결과 영역을 숨김
 * - 결과 창에서 "프롬프트 불러오기·레퍼런스로" → 프롬프트 창이 반영
 */
export type RefItemMessage = {
  id: string;
  kind: "image" | "video";
  filename: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  urls: { thumb: string; src: string; download: string };
};

export type StudioMessage =
  | { type: "results-alive"; kind: "image" | "video"; windowId: string }
  | { type: "desk-alive"; kind: "image" | "video" }
  | { type: "results-closed"; kind: "image" | "video"; windowId: string }
  | { type: "submitted"; kind: "image" | "video"; generations: GenerationDTO[] }
  | { type: "reuse"; kind: "image" | "video"; generation: GenerationDTO }
  | { type: "use-as-reference"; kind: "image" | "video"; item: RefItemMessage }
  | { type: "focus-prompt"; kind: "image" | "video" };

const CHANNEL = "zipup-studio";

export function useStudioChannel(onMessage: (m: StudioMessage) => void) {
  const handler = React.useRef(onMessage);
  React.useLayoutEffect(() => {
    handler.current = onMessage;
  });
  const channel = React.useRef<BroadcastChannel | null>(null);
  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (e) => handler.current(e.data as StudioMessage);
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);
  return React.useCallback((m: StudioMessage) => channel.current?.postMessage(m), []);
}

/** 프롬프트 창: 결과 창이 열려 있는지 추적 */
export function useDualMonitor(kind: "image" | "video", handlers: { onReuse: (g: GenerationDTO) => void; onReference: (item: RefItemMessage) => void; onFocus: () => void }) {
  const [lastSeen, setLastSeen] = React.useState(0);
  const [now, setNow] = React.useState(0);
  const post = useStudioChannel((m) => {
    if (m.kind !== kind) return;
    if (m.type === "results-alive") setLastSeen(Date.now());
    else if (m.type === "results-closed") setLastSeen(0);
    else if (m.type === "reuse") handlers.onReuse(m.generation);
    else if (m.type === "use-as-reference") handlers.onReference(m.item);
    else if (m.type === "focus-prompt") handlers.onFocus();
  });
  React.useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      post({ type: "desk-alive", kind });
    }, 2000);
    return () => clearInterval(t);
  }, [post, kind]);
  const active = lastSeen > 0 && now - lastSeen < 6000;

  const open = React.useCallback(async () => {
    const url = `/popout/results/${kind}`;
    const name = `zipup-results-${kind}`;
    let features = "popup=yes,width=1400,height=900";
    // 창 관리 API (Chrome·Edge): 다른 모니터 전체 크기로 열기
    try {
      const w = window as unknown as { getScreenDetails?: () => Promise<{ screens: ScreenLike[]; currentScreen: ScreenLike }> };
      if (w.getScreenDetails) {
        const details = await w.getScreenDetails();
        const other = details.screens.find((s) => s !== details.currentScreen);
        if (other) features = `popup=yes,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
      }
    } catch {
      // 권한을 거부하면 기본 위치에 열기
    }
    const win = window.open(url, name, features);
    if (!win) return false;
    win.focus();
    return true;
  }, [kind]);

  return { active, open, post };
}

type ScreenLike = { availLeft: number; availTop: number; availWidth: number; availHeight: number };
