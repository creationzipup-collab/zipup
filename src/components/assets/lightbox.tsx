"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Share2,
  FolderInput,
  Hash,
  Heart,
  ImagePlus,
  Info,
  Maximize2,
  MessageSquare,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { ColorLabelPicker, FlagButtons, selectionKeyAction, StarRating } from "@/components/assets/selection-controls";
import { ShareDialog } from "@/components/prompts/share-dialog";
import { ModelSwatch } from "@/components/studio/model-picker";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tip } from "@/components/ui/menu";
import { Avatar, Kbd, TimeAgo } from "@/components/ui/misc";
import { downloadUrl, useAssetMutations, type AssetPatch } from "@/lib/client/assets";
import { getModel } from "@/lib/models/registry";
import type { AssetListItem } from "@/lib/services/library";
import { cn, fetchJson, formatBytes, formatDuration, usd } from "@/lib/utils";

export type LightboxItem = Pick<AssetListItem, "id" | "kind" | "urls" | "width" | "height" | "durationSec" | "filename">;

type Detail = AssetListItem & {
  generation: null | {
    id: string;
    modelId: string;
    workflow: string;
    params: Record<string, unknown>;
    inputs: Record<string, unknown>;
    prompt: string;
    costMicros: number | null;
    estimatedCostMicros: number;
    isDraft: boolean;
    createdAt: string;
    completedAt: string | null;
    inputAssets: { id: string; role: string; kind: string; thumb: string }[];
  };
};

type Comment = { id: string; body: string; createdAt: string; userId: string; userName: string; userImage: string | null };

export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
  onMoveProject,
  onFinalize,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onMoveProject?: (ids: string[]) => void;
  onFinalize?: (generationId: string) => void;
}) {
  const item = items[index];
  const router = useRouter();
  const qc = useQueryClient();
  const { update } = useAssetMutations();
  const [panel, setPanel] = React.useState(true);
  const [sharing, setSharing] = React.useState(false);
  const tagInput = React.useRef<HTMLInputElement>(null);

  const { data: detail, refetch } = useQuery({
    queryKey: ["asset", item?.id],
    queryFn: () => fetchJson<Detail>(`/api/assets/${item!.id}`),
    enabled: !!item,
    staleTime: 5_000,
  });

  const patch = React.useCallback(
    async (p: AssetPatch) => {
      if (!item) return;
      // 낙관적 업데이트
      qc.setQueryData<Detail>(["asset", item.id], (d) =>
        d
          ? {
              ...d,
              ...(p.rating !== undefined ? { rating: p.rating } : {}),
              ...(p.flag !== undefined ? { flag: p.flag } : {}),
              ...(p.colorLabel !== undefined ? { colorLabel: p.colorLabel } : {}),
              ...(p.favorite !== undefined ? { isFavorite: p.favorite } : {}),
              ...(p.addTags ? { tags: Array.from(new Set([...d.tags, ...p.addTags])) } : {}),
              ...(p.removeTags ? { tags: d.tags.filter((t) => !p.removeTags!.includes(t)) } : {}),
            }
          : d,
      );
      const ok = await update([item.id], p);
      if (!ok) void refetch();
    },
    [item, qc, update, refetch],
  );

  // 키보드
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(t.tagName)) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowRight") return onIndexChange(Math.min(items.length - 1, index + 1));
      if (e.key === "ArrowLeft") return onIndexChange(Math.max(0, index - 1));
      if (e.key.toLowerCase() === "i") return setPanel((p) => !p);
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        setPanel(true);
        setTimeout(() => tagInput.current?.focus(), 30);
        return;
      }
      if (e.key.toLowerCase() === "d" && item) return downloadUrl(item.urls.download, item.filename);
      const act = selectionKeyAction(e);
      if (!act || !detail) return;
      e.preventDefault();
      if ("rating" in act) void patch({ rating: act.rating });
      else if ("flag" in act) void patch({ flag: act.flag === detail.flag ? null : act.flag });
      else if ("colorLabel" in act) void patch({ colorLabel: act.colorLabel === detail.colorLabel ? null : act.colorLabel });
      else void patch({ favorite: !detail.isFavorite });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndexChange, detail, patch, item]);

  if (!item) return null;
  const model = detail?.modelId ? getModel(detail.modelId) : undefined;
  const params = detail?.generation?.params ?? {};

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[45] flex bg-[#050506]/97 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      data-hotkeys-scope
    >
      {/* 스테이지 */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-white/70 hover:bg-white/10 hover:text-white" aria-label="닫기">
            <X />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white/90">{item.filename}</p>
            <p className="font-mono text-[11px] text-white/40">
              {index + 1} / {items.length}
              {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
              {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Tip content="즐겨찾기" shortcut="F">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => detail && patch({ favorite: !detail.isFavorite })}
                className={cn("hover:bg-white/10", detail?.isFavorite ? "text-[#ff5b8a]" : "text-white/70 hover:text-white")}
              >
                <Heart className={cn(detail?.isFavorite && "fill-current")} />
              </Button>
            </Tip>
            {detail && (detail.prompt || detail.generation?.prompt) && (
              <Tip content="이 클립의 프롬프트를 게시판에 공유">
                <Button variant="ghost" size="sm" onClick={() => setSharing(true)} className="text-white/70 hover:bg-white/10 hover:text-white">
                  <Share2 /> 공유
                </Button>
              </Tip>
            )}
            <Tip content="다운로드 (자동 파일명)" shortcut="D">
              <Button variant="ghost" size="icon-sm" onClick={() => downloadUrl(item.urls.download, item.filename)} className="text-white/70 hover:bg-white/10 hover:text-white">
                <Download />
              </Button>
            </Tip>
            <Tip content="원본 새 탭">
              <Button variant="ghost" size="icon-sm" onClick={() => window.open(item.urls.src, "_blank")} className="text-white/70 hover:bg-white/10 hover:text-white">
                <Maximize2 />
              </Button>
            </Tip>
            <Tip content="정보 패널" shortcut="I">
              <Button variant="ghost" size="icon-sm" onClick={() => setPanel((p) => !p)} className={cn("hover:bg-white/10", panel ? "text-white" : "text-white/60")}>
                <Info />
              </Button>
            </Tip>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex size-full items-center justify-center"
            >
              {item.kind === "video" ? (
                <video key={item.urls.src} src={item.urls.src} controls autoPlay loop playsInline className="max-h-full max-w-full rounded-lg shadow-2xl" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.urls.src} alt={item.filename} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
              )}
            </motion.div>
          </AnimatePresence>
          {index > 0 && (
            <button
              onClick={() => onIndexChange(index - 1)}
              className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur transition hover:bg-white/10"
              aria-label="이전"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          {index < items.length - 1 && (
            <button
              onClick={() => onIndexChange(index + 1)}
              className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur transition hover:bg-white/10"
              aria-label="다음"
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </div>

        {/* 셀렉 바 */}
        {detail && (
          <div className="mx-auto mb-5 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 backdrop-blur">
            <StarRating value={detail.rating} onChange={(v) => patch({ rating: v })} size={18} />
            <span className="h-5 w-px bg-white/10" />
            <FlagButtons value={detail.flag} onChange={(v) => patch({ flag: v })} />
            <span className="h-5 w-px bg-white/10" />
            <ColorLabelPicker value={detail.colorLabel} onChange={(v) => patch({ colorLabel: v })} />
            <span className="hidden items-center gap-1 text-[10.5px] text-white/35 lg:flex">
              <Kbd className="border-white/15 bg-white/5 text-white/50">1-5</Kbd> 별점 <Kbd className="border-white/15 bg-white/5 text-white/50">P</Kbd> OK
              <Kbd className="border-white/15 bg-white/5 text-white/50">K</Kbd> KEEP <Kbd className="border-white/15 bg-white/5 text-white/50">X</Kbd> NG <Kbd className="border-white/15 bg-white/5 text-white/50">←→</Kbd>
            </span>
          </div>
        )}
      </div>

      {/* 정보 패널 */}
      {panel && (
        <aside className="hidden w-[360px] shrink-0 flex-col border-l border-white/10 bg-[#0b0b0d] text-fg md:flex" data-theme="dark">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
            {!detail ? (
              <div className="flex flex-col gap-3">
                <div className="skeleton h-5 w-2/3 rounded" />
                <div className="skeleton h-20 rounded-lg" />
                <div className="skeleton h-5 w-1/2 rounded" />
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* 모델 */}
                <div className="flex items-center gap-3">
                  {model ? <ModelSwatch model={model} className="size-10" /> : <span className="flex size-10 items-center justify-center rounded-[10px] bg-panel-3 text-fg-3"><ImagePlus className="size-4" /></span>}
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold">{model?.name ?? (detail.source === "upload" ? "업로드한 파일" : detail.modelId)}</p>
                    <p className="text-[12px] text-fg-3">
                      {detail.userName} · <TimeAgo date={detail.createdAt} />
                    </p>
                  </div>
                </div>

                {/* 프롬프트 */}
                {detail.prompt && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="eyebrow">Prompt</span>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(detail.prompt);
                          toast("프롬프트를 복사했어요.");
                        }}
                        className="flex items-center gap-1 text-[11px] text-fg-3 hover:text-fg"
                      >
                        <Copy className="size-3" /> 복사
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{detail.prompt}</p>
                  </div>
                )}

                {/* 액션 */}
                <div className="grid grid-cols-2 gap-2">
                  {detail.generation && (
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/create/${detail.kind}?from=${detail.id}`)}>
                      <RefreshCw /> 이 설정으로 다시
                    </Button>
                  )}
                  {detail.kind === "image" && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/create/image?ref=${detail.id}`)}>
                        <ImagePlus /> 레퍼런스로
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => router.push(`/create/video?start=${detail.id}`)}>
                        <Clapperboard /> 영상으로
                      </Button>
                    </>
                  )}
                  {detail.kind === "video" && (
                    <Button size="sm" variant="secondary" onClick={() => router.push(`/create/video?ref=${detail.id}`)}>
                      <Clapperboard /> 편집·연장
                    </Button>
                  )}
                  {detail.generation?.isDraft && onFinalize && (
                    <Button size="sm" variant="primary" className="col-span-2" onClick={() => onFinalize(detail.generation!.id)}>
                      720p 최종 렌더
                    </Button>
                  )}
                  <Menu>
                    <MenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="col-span-2">
                        더보기
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      {onMoveProject && (
                        <MenuItem onSelect={() => onMoveProject([detail.id])}>
                          <FolderInput /> 다른 프로젝트로 이동
                        </MenuItem>
                      )}
                      <MenuItem onSelect={() => router.push(`/projects/${detail.projectId}`)}>
                        <FolderInput /> 프로젝트 열기
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        danger
                        onSelect={async () => {
                          if (await update([detail.id], { deleted: true })) {
                            toast("휴지통으로 옮겼어요.");
                            onClose();
                          }
                        }}
                      >
                        <Trash2 /> 휴지통으로
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>

                {/* 태그 */}
                <div className="flex flex-col gap-2">
                  <span className="eyebrow">Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map((t) => (
                      <span key={t} className="group inline-flex h-6 items-center gap-1 rounded-md bg-panel-3 pl-2 pr-1 text-[12px] text-fg-2">
                        <Hash className="size-3 text-fg-4" />
                        {t}
                        <button onClick={() => patch({ removeTags: [t] })} className="rounded p-0.5 text-fg-4 hover:text-fg" aria-label={`${t} 삭제`}>
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      ref={tagInput}
                      placeholder={detail.tags.length ? "추가…" : "태그 추가 (Enter)"}
                      className="h-6 min-w-[100px] flex-1 bg-transparent text-[12px] outline-none placeholder:text-fg-4"
                      onKeyDown={(e) => {
                        const v = e.currentTarget.value.trim();
                        if ((e.key === "Enter" || e.key === ",") && v) {
                          e.preventDefault();
                          const names = v.split(/[,\s]+/).filter(Boolean);
                          void patch({ addTags: names });
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                  </div>
                </div>

                {/* 상세 */}
                <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
                  <dt className="text-fg-4">프로젝트</dt>
                  <dd className="truncate text-fg-2">{detail.projectName}</dd>
                  {detail.cutCode && (
                    <>
                      <dt className="text-fg-4">컷 · 테이크</dt>
                      <dd className="font-mono text-fg-2">
                        {detail.cutCode}
                        {detail.take ? ` · T${String(detail.take).padStart(2, "0")}` : ""}
                      </dd>
                    </>
                  )}
                  <dt className="text-fg-4">파일</dt>
                  <dd className="truncate text-fg-2">{detail.filename}</dd>
                  <dt className="text-fg-4">크기</dt>
                  <dd className="text-fg-2">
                    {detail.width && detail.height ? `${detail.width}×${detail.height}` : "-"} · {formatBytes(detail.sizeBytes)}
                  </dd>
                  {detail.generation && (
                    <>
                      <dt className="text-fg-4">설정</dt>
                      <dd className="flex flex-wrap gap-1">
                        {Object.entries(params)
                          .filter(([, v]) => v !== undefined && v !== null && v !== "")
                          .map(([k, v]) => (
                            <span key={k} className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[10.5px] text-fg-3">
                              {k}:{String(v)}
                            </span>
                          ))}
                      </dd>
                      <dt className="text-fg-4">비용</dt>
                      <dd className="font-mono text-fg-2">
                        {usd(detail.generation.costMicros ?? detail.generation.estimatedCostMicros)}
                        {detail.generation.isDraft && <span className="ml-2 rounded bg-info/15 px-1 text-[10px] text-info">DRAFT</span>}
                      </dd>
                    </>
                  )}
                </dl>

                {detail.generation && detail.generation.inputAssets.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="eyebrow">Inputs</span>
                    <div className="flex flex-wrap gap-2">
                      {detail.generation.inputAssets.map((a) => (
                        <Tip key={a.id + a.role} content={a.role}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.thumb} alt={a.role} className="size-12 rounded-lg object-cover ring-1 ring-line-2" />
                        </Tip>
                      ))}
                    </div>
                  </div>
                )}

                <Comments assetId={detail.id} />
              </div>
            )}
          </div>
        </aside>
      )}
      {detail && (
        <ShareDialog
          open={sharing}
          onOpenChange={setSharing}
          assetId={detail.id}
          preview={{ thumb: item.kind === "image" ? item.urls.thumb : item.urls.src, kind: item.kind, prompt: detail.generation?.prompt || detail.prompt }}
        />
      )}
    </motion.div>
  );
}

function Comments({ assetId }: { assetId: string }) {
  const qc = useQueryClient();
  const [text, setText] = React.useState("");
  const { data } = useQuery({
    queryKey: ["comments", assetId],
    queryFn: () => fetchJson<{ items: Comment[] }>(`/api/assets/${assetId}/comments`).then((r) => r.items),
  });
  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      await fetchJson(`/api/assets/${assetId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      void qc.invalidateQueries({ queryKey: ["comments", assetId] });
    } catch (e) {
      toast.error((e as Error).message);
      setText(body);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow flex items-center gap-1.5">
        <MessageSquare className="size-3" /> Comments {data?.length ? `(${data.length})` : ""}
      </span>
      <div className="flex flex-col gap-3">
        {data?.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.userName} image={c.userImage} size={24} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px]">
                <span className="font-medium">{c.userName}</span> <TimeAgo date={c.createdAt} className="text-fg-4" />
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-2">
                {c.body.split(/(@[\p{L}\p{N}._-]+)/u).map((part, i) =>
                  part.startsWith("@") ? (
                    <span key={i} className="text-accent">
                      {part}
                    </span>
                  ) : (
                    part
                  ),
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 rounded-xl border border-line-2 bg-panel-2/60 p-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="코멘트 남기기 (@이름으로 언급)"
          className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-1 py-1 text-[12.5px] outline-none placeholder:text-fg-4"
        />
        <Button size="icon-xs" variant="primary" onClick={send} disabled={!text.trim()} aria-label="보내기">
          <Send />
        </Button>
      </div>
    </div>
  );
}
