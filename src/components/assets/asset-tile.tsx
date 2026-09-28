"use client";

import { Ban, Check, Heart, Star } from "lucide-react";
import * as React from "react";

import { MediaThumb } from "@/components/assets/media";
import { colorHex } from "@/components/assets/selection-controls";
import { getModel } from "@/lib/models/registry";
import type { AssetListItem } from "@/lib/services/library";
import { cn } from "@/lib/utils";

export const AssetTile = React.memo(function AssetTile({
  a,
  selected,
  focused,
  selecting,
  square,
  showMeta,
  onClick,
  onToggleSelect,
  onFavorite,
}: {
  a: AssetListItem;
  selected: boolean;
  focused: boolean;
  selecting: boolean;
  square: boolean;
  showMeta: boolean;
  onClick: (e: React.MouseEvent) => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onFavorite: () => void;
}) {
  const model = a.modelId ? getModel(a.modelId) : undefined;
  const color = colorHex(a.colorLabel);
  return (
    <div
      data-asset-id={a.id}
      className={cn(
        "group relative overflow-hidden rounded-xl bg-panel-2 outline-none transition-[box-shadow,opacity]",
        selected && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
        focused && !selected && "ring-2 ring-accent/80 ring-offset-2 ring-offset-bg",
        a.flag === "reject" && "opacity-45 hover:opacity-100",
      )}
      style={{ aspectRatio: square ? "1 / 1" : a.width && a.height ? `${a.width} / ${a.height}` : "1 / 1" }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/x-zipup-asset",
          JSON.stringify({ id: a.id, kind: a.kind, filename: a.filename, width: a.width, height: a.height, durationSec: a.durationSec, urls: a.urls }),
        );
      }}
    >
      <button type="button" className="absolute inset-0 cursor-zoom-in" onClick={onClick} aria-label={a.filename}>
        <MediaThumb kind={a.kind} thumb={a.urls.thumb} src={a.urls.src} durationSec={a.durationSec} />
      </button>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-black/25 opacity-0 transition-opacity group-hover:opacity-100" />

      {/* 선택 */}
      <button
        type="button"
        onClick={onToggleSelect}
        className={cn(
          "absolute left-2 top-2 flex size-5 items-center justify-center rounded-md border transition",
          selected ? "border-transparent bg-inv text-inv-fg opacity-100" : "border-white/60 bg-black/30 text-transparent backdrop-blur",
          selecting || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        aria-label={selected ? "선택 해제" : "선택"}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </button>

      {/* 즐겨찾기 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFavorite();
        }}
        className={cn(
          "absolute right-2 top-2 flex size-7 items-center justify-center rounded-lg transition",
          a.isFavorite ? "text-[#ff5b8a] opacity-100" : "bg-black/35 text-white/90 opacity-0 backdrop-blur group-hover:opacity-100",
        )}
        aria-label="즐겨찾기"
      >
        <Heart className={cn("size-3.5", a.isFavorite && "fill-current drop-shadow")} />
      </button>

      {/* 상태 배지 */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1">
        {a.flag === "pick" && (
          <span className="flex size-5 items-center justify-center rounded-md bg-success text-black shadow">
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
        {a.flag === "reject" && (
          <span className="flex size-5 items-center justify-center rounded-md bg-danger text-white shadow">
            <Ban className="size-3" strokeWidth={2.5} />
          </span>
        )}
        {color && <span className="size-3 rounded-full ring-2 ring-black/30" style={{ background: color }} />}
        {a.rating > 0 && (
          <span className="flex h-5 items-center gap-0.5 rounded-md bg-black/55 px-1.5 font-mono text-[10.5px] text-white backdrop-blur">
            <Star className="size-2.5 fill-star text-star" /> {a.rating}
          </span>
        )}
      </div>

      {showMeta && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 p-2.5 pt-8 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
          <p className="line-clamp-2 text-[11.5px] leading-snug text-white/90">{a.prompt || a.filename}</p>
          <p className="mt-1 truncate text-[10.5px] text-white/55">
            {model?.shortName ?? (a.source === "upload" ? "업로드" : a.modelId)} · {a.userName}
          </p>
        </div>
      )}
    </div>
  );
});
