"use client";

import * as React from "react";

export type ResultsView = "batches" | "gallery";

/** 결과 보기 방식 (브라우저별로 기억) */
export function useResultsView(key: string, fallback: ResultsView): [ResultsView, (v: ResultsView) => void] {
  const [view, setView] = React.useState<ResultsView>(fallback);
  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const v = localStorage.getItem(`zipup:results-view:${key}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장된 보기 방식은 마운트 후에만 읽을 수 있음
      if (v === "batches" || v === "gallery") setView(v);
    } catch {}
  }, [key]);
  const set = React.useCallback(
    (v: ResultsView) => {
      setView(v);
      try {
        localStorage.setItem(`zipup:results-view:${key}`, v);
      } catch {}
    },
    [key],
  );
  return [view, set];
}
