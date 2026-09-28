"use client";

import { FolderOpen, ImagePlus, Plus, Upload, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { AssetPicker, type PickedAsset } from "@/components/assets/asset-picker";
import { MediaThumb } from "@/components/assets/media";
import { Menu, MenuContent, MenuItem, MenuTrigger, Tip } from "@/components/ui/menu";
import { uploadFile } from "@/lib/client/upload";
import type { InputSlots } from "@/lib/models/types";
import { ACCEPT_UPLOADS } from "@/lib/uploads";
import { cn } from "@/lib/utils";

export type RefAsset = PickedAsset;

export type StudioInputs = {
  images: RefAsset[];
  startFrame?: RefAsset;
  endFrame?: RefAsset;
  videos: RefAsset[];
};

export const EMPTY_INPUTS: StudioInputs = { images: [], videos: [] };

type SlotKey = "images" | "startFrame" | "endFrame" | "videos";

export function useUploader(projectId?: string | null) {
  const [uploading, setUploading] = React.useState<{ id: string; name: string; progress: number }[]>([]);
  const upload = React.useCallback(
    async (files: File[]): Promise<RefAsset[]> => {
      const out: RefAsset[] = [];
      await Promise.all(
        files.map(async (file) => {
          const id = Math.random().toString(36).slice(2);
          setUploading((u) => [...u, { id, name: file.name, progress: 0 }]);
          try {
            const a = await uploadFile(file, {
              projectId,
              onProgress: (p) => setUploading((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))),
            });
            out.push({ id: a.id, kind: a.kind, filename: a.filename, width: a.width, height: a.height, durationSec: a.durationSec, urls: a.urls });
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setUploading((u) => u.filter((x) => x.id !== id));
          }
        }),
      );
      return out;
    },
    [projectId],
  );
  return { uploading, upload };
}

export function ReferenceSlots({
  slots,
  value,
  onChange,
  projectId,
}: {
  slots: InputSlots;
  value: StudioInputs;
  onChange: (v: StudioInputs) => void;
  projectId?: string | null;
}) {
  const { uploading, upload } = useUploader(projectId);
  const [picker, setPicker] = React.useState<{ slot: SlotKey } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pendingSlot = React.useRef<SlotKey>("images");
  const [dragOver, setDragOver] = React.useState(false);
  const valueRef = React.useRef(value);
  React.useLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);

  const add = React.useCallback(
    (slot: SlotKey, items: RefAsset[]) => {
      const v = valueRef.current;
      if (!items.length) return;
      if (slot === "startFrame" || slot === "endFrame") {
        const img = items.find((i) => i.kind === "image");
        if (!img) return toast.error("프레임에는 이미지만 넣을 수 있어요.");
        onChange({ ...v, [slot]: img });
        return;
      }
      if (slot === "images") {
        const imgs = items.filter((i) => i.kind === "image");
        const vids = items.filter((i) => i.kind === "video");
        const max = slots.images?.max ?? 0;
        const next = [...v.images, ...imgs.filter((i) => !v.images.some((x) => x.id === i.id))].slice(0, max);
        const nextV = slots.videos ? [...v.videos, ...vids].slice(0, slots.videos.max) : v.videos;
        if (vids.length && !slots.videos) toast.error("이 모델은 영상 레퍼런스를 받지 않아요.");
        if (v.images.length + imgs.length > max) toast.message(`이미지는 최대 ${max}장까지 넣을 수 있어요.`);
        onChange({ ...v, images: next, videos: nextV });
        return;
      }
      const vids = items.filter((i) => i.kind === "video");
      if (!vids.length) return toast.error("영상 파일을 넣어 주세요.");
      onChange({ ...v, videos: [...v.videos, ...vids].slice(0, slots.videos?.max ?? 0) });
    },
    [onChange, slots],
  );

  async function onFiles(files: File[], slot: SlotKey) {
    if (!files.length) return;
    const items = await upload(files);
    add(slot, items);
  }

  // 붙여넣기(Ctrl+V)로 레퍼런스 추가
  React.useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || (target.tagName === "TEXTAREA" && !e.clipboardData?.files.length))) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
      if (!files.length) return;
      e.preventDefault();
      const slot: SlotKey = slots.images ? "images" : slots.startFrame ? "startFrame" : "videos";
      void onFiles(files, slot);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const openUpload = (slot: SlotKey) => {
    pendingSlot.current = slot;
    fileRef.current?.click();
  };

  const hasFrames = !!slots.startFrame;

  return (
    <div
      className={cn("flex flex-col gap-4 rounded-2xl transition", dragOver && "ring-2 ring-accent/60 ring-offset-4 ring-offset-bg")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("application/x-zipup-asset")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const internal = e.dataTransfer.getData("application/x-zipup-asset");
        if (internal) {
          try {
            add(slots.images ? "images" : "startFrame", [JSON.parse(internal) as RefAsset]);
          } catch {}
          return;
        }
        void onFiles(Array.from(e.dataTransfer.files), slots.images ? "images" : "startFrame");
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_UPLOADS}
        multiple
        hidden
        onChange={(e) => {
          void onFiles(Array.from(e.target.files ?? []), pendingSlot.current);
          e.target.value = "";
        }}
      />

      {hasFrames && (
        <div className="grid grid-cols-2 gap-2">
          <FrameSlot
            label={slots.startFrame!.label}
            asset={value.startFrame}
            onClear={() => onChange({ ...value, startFrame: undefined, endFrame: undefined })}
            onUpload={() => openUpload("startFrame")}
            onPick={() => setPicker({ slot: "startFrame" })}
            onDropFiles={(f) => onFiles(f, "startFrame")}
          />
          {slots.endFrame && (
            <FrameSlot
              label={slots.endFrame.label}
              asset={value.endFrame}
              disabled={!value.startFrame}
              onClear={() => onChange({ ...value, endFrame: undefined })}
              onUpload={() => openUpload("endFrame")}
              onPick={() => setPicker({ slot: "endFrame" })}
              onDropFiles={(f) => onFiles(f, "endFrame")}
            />
          )}
        </div>
      )}

      {slots.images && (
        <RefRow
          label={slots.images.label}
          hint={slots.images.hint}
          max={slots.images.max}
          items={value.images}
          uploading={uploading}
          onRemove={(id) => onChange({ ...value, images: value.images.filter((x) => x.id !== id) })}
          onUpload={() => openUpload("images")}
          onPick={() => setPicker({ slot: "images" })}
        />
      )}
      {slots.videos && (
        <RefRow
          label={slots.videos.label}
          hint={slots.videos.hint}
          max={slots.videos.max}
          items={value.videos}
          uploading={[]}
          onRemove={(id) => onChange({ ...value, videos: value.videos.filter((x) => x.id !== id) })}
          onUpload={() => openUpload("videos")}
          onPick={() => setPicker({ slot: "videos" })}
          video
        />
      )}

      <AssetPicker
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        kind={picker?.slot === "videos" ? "video" : "image"}
        max={
          picker?.slot === "images"
            ? Math.max(1, (slots.images?.max ?? 1) - value.images.length)
            : picker?.slot === "videos"
              ? Math.max(1, (slots.videos?.max ?? 1) - value.videos.length)
              : 1
        }
        projectId={projectId ?? undefined}
        onPick={(items) => picker && add(picker.slot, items)}
      />
    </div>
  );
}

function AddMenu({ onUpload, onPick, children }: { onUpload: () => void; onPick: () => void; children: React.ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuContent align="start">
        <MenuItem onSelect={onUpload}>
          <Upload /> 파일 업로드
        </MenuItem>
        <MenuItem onSelect={onPick}>
          <FolderOpen /> 라이브러리에서 선택
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function FrameSlot({
  label,
  asset,
  onClear,
  onUpload,
  onPick,
  onDropFiles,
  disabled,
}: {
  label: string;
  asset?: RefAsset;
  onClear: () => void;
  onUpload: () => void;
  onPick: () => void;
  onDropFiles: (f: File[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-fg-3">{label}</span>
      {asset ? (
        <div className="group relative aspect-video overflow-hidden rounded-xl border border-line-2">
          <MediaThumb kind="image" thumb={asset.urls.thumb} src={asset.urls.src} />
          <button
            type="button"
            onClick={onClear}
            className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100"
            aria-label="제거"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <AddMenu onUpload={onUpload} onPick={onPick}>
          <button
            type="button"
            disabled={disabled}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDropFiles(Array.from(e.dataTransfer.files));
            }}
            className="flex aspect-video flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-3 bg-panel-2/30 text-fg-4 transition hover:border-fg-3 hover:bg-panel-2/60 hover:text-fg-2 disabled:opacity-40"
          >
            <ImagePlus className="size-5" />
            <span className="text-[11px]">{disabled ? "시작 프레임 먼저" : "드롭 또는 클릭"}</span>
          </button>
        </AddMenu>
      )}
    </div>
  );
}

function RefRow({
  label,
  hint,
  max,
  items,
  uploading,
  onRemove,
  onUpload,
  onPick,
  video,
}: {
  label: string;
  hint?: string;
  max: number;
  items: RefAsset[];
  uploading: { id: string; name: string; progress: number }[];
  onRemove: (id: string) => void;
  onUpload: () => void;
  onPick: () => void;
  video?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-fg-3">{label}</span>
        <span className="font-mono text-[11px] text-fg-4">
          {items.length}/{max}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((a, i) => (
          <div key={a.id} className="group relative size-16 overflow-hidden rounded-xl border border-line-2">
            <MediaThumb kind={a.kind} thumb={a.urls.thumb} src={a.urls.src} durationSec={a.durationSec} />
            {video && i === 0 && (
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 font-mono text-[9px] text-white">SRC</span>
            )}
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
              aria-label="제거"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {uploading.map((u) => (
          <div key={u.id} className="generating relative flex size-16 items-center justify-center rounded-xl border border-line-2">
            <span className="relative z-10 font-mono text-[11px] text-fg-2">{Math.round(u.progress * 100)}%</span>
          </div>
        ))}
        {items.length < max && (
          <AddMenu onUpload={onUpload} onPick={onPick}>
            <button
              type="button"
              className="flex size-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-3 bg-panel-2/30 text-fg-4 transition hover:border-fg-3 hover:text-fg-2"
            >
              <Plus className="size-4" />
              <span className="text-[10px]">추가</span>
            </button>
          </AddMenu>
        )}
      </div>
      {hint && !items.length && (
        <Tip content="이미지를 드래그하거나 Ctrl+V로 붙여넣을 수도 있어요">
          <p className="text-[11px] leading-snug text-fg-4">{hint}</p>
        </Tip>
      )}
    </div>
  );
}
