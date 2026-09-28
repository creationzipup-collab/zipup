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
  const ref = React.useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = React.useState(false);
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
          ref={ref}
          src={`${src}#t=0.1`}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
          className={cn("size-full transition-opacity duration-300", fit === "cover" ? "object-cover" : "object-contain", loaded ? "opacity-100" : "opacity-0")}
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
      src={thumb}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      className={cn(
        "size-full bg-panel-3 transition-opacity duration-300",
        fit === "cover" ? "object-cover" : "object-contain",
        loaded ? "opacity-100" : "opacity-0",
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
