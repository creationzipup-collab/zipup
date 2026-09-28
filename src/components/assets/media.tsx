"use client";

import { Play } from "lucide-react";
import * as React from "react";

import { cn, formatDuration } from "@/lib/utils";

/** 갤러리 썸네일: 이미지 또는 (호버 시 재생되는) 영상 */
export function MediaThumb({
  kind,
  thumb,
  src,
  alt = "",
  className,
  fit = "cover",
  durationSec,
  autoPlayOnHover = true,
  eager,
}: {
  kind: "image" | "video";
  thumb: string;
  src: string;
  alt?: string;
  className?: string;
  fit?: "cover" | "contain";
  durationSec?: number | null;
  autoPlayOnHover?: boolean;
  eager?: boolean;
}) {
  const ref = React.useRef<HTMLVideoElement | null>(null);
  // 불러오면 서서히 나타나기 — 하이드레이션 전에 이미 불러온 경우(onLoad가 안 옴)도 요소에서 직접 확인해요
  const markVideo = React.useCallback((el: HTMLVideoElement | null) => {
    ref.current = el;
    if (el && el.readyState >= 2) el.dataset.loaded = "1";
  }, []);
  const markImg = React.useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) el.dataset.loaded = "1";
  }, []);
  if (kind === "video") {
    return (
      <div
        className={cn("relative size-full overflow-hidden bg-panel-3", className)}
        onMouseEnter={() => autoPlayOnHover && ref.current?.play().catch(() => {})}
        onMouseLeave={() => {
          if (!ref.current) return;
          ref.current.pause();
          ref.current.currentTime = 0.1;
        }}
      >
        <video
          ref={markVideo}
          src={`${src}#t=0.1`}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={(e) => (e.currentTarget.dataset.loaded = "1")}
          className={cn("size-full opacity-0 transition-opacity duration-300 data-[loaded=1]:opacity-100", fit === "cover" ? "object-cover" : "object-contain")}
        />
        <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10.5px] text-white backdrop-blur">
          <Play className="size-2.5 fill-white" />
          {durationSec ? formatDuration(durationSec) : "VIDEO"}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={markImg}
      src={thumb}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onLoad={(e) => (e.currentTarget.dataset.loaded = "1")}
      className={cn(
        "size-full bg-panel-3 opacity-0 transition-opacity duration-300 data-[loaded=1]:opacity-100",
        fit === "cover" ? "object-cover" : "object-contain",
        className,
      )}
    />
  );
}

/** 비율 문자열 → CSS aspect-ratio */
export function aspectFrom(width?: number | null, height?: number | null, ratio?: string): string {
  if (width && height) return `${width} / ${height}`;
  if (ratio && /^\d+:\d+$/.test(ratio)) return ratio.replace(":", " / ");
  return "1 / 1";
}
