"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 배경 영상 — 소리 없이 반복. 화면 밖에 있거나 "동작 줄이기"를 켠 사람에게는 멈춘 첫 장면만 보여요.
 * 지금은 임시 영상(public/media/reel.mp4). 나중에 팀 결과물로 바꾸면 돼요.
 */
export function AmbientVideo({
  src = "/media/reel.mp4",
  poster = "/media/reel-poster.webp",
  className,
  videoClassName,
  shade = "hero",
}: {
  src?: string;
  poster?: string;
  className?: string;
  videoClassName?: string;
  /** hero: 아래·왼쪽으로 어두워짐, panel: 전체를 더 어둡게, none: 그대로 */
  shade?: "hero" | "panel" | "none";
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const play = () => {
      if (reduce.matches) return;
      void v.play().catch(() => {});
    };
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : v.pause()), { threshold: 0.05 });
    io.observe(v);
    const onVis = () => (document.hidden ? v.pause() : play());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <video
        ref={ref}
        className={cn("absolute inset-0 size-full object-cover", videoClassName)}
        poster={poster}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
      >
        <source src={src} type="video/mp4" />
      </video>
      {shade === "hero" && (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(5_7_10/0.55)_0%,rgb(5_7_10/0.15)_28%,rgb(5_7_10/0.25)_62%,var(--bg)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(5_7_10/0.6)_0%,transparent_38%,transparent_62%,rgb(5_7_10/0.55)_100%)]" />
        </>
      )}
      {shade === "panel" && <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(5_7_10/0.72),rgb(5_7_10/0.88))]" />}
    </div>
  );
}
