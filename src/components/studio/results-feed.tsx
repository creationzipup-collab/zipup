"use client";

import {
  AlertTriangle,
  Clapperboard,
  Copy,
  Download,
  Heart,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { aspectFrom, MediaThumb } from "@/components/assets/media";
import { StarRating, VerdictBadge, VERDICT_STYLE } from "@/components/assets/selection-controls";
import { Slate } from "@/components/brand/slate";
import { ShareDialog } from "@/components/prompts/share-dialog";
import type { LightboxItem } from "@/components/assets/lightbox";
import { ModelSwatch, type ModelStatus } from "@/components/studio/model-picker";
import type { RefAsset } from "@/components/studio/reference-slots";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tip } from "@/components/ui/menu";
import { TimeAgo } from "@/components/ui/misc";
import { downloadUrl, downloadZip, useAssetMutations } from "@/lib/client/assets";
import { useNow } from "@/lib/client/use-now";
import { cancelGenerationRequest, isActive, usePushGenerations, type GenerationDTO } from "@/lib/client/generations";
import { getModel, seedanceCompleteUsd, seedanceTokens } from "@/lib/models/registry";
import { FLAG_LABEL, GENERATION_STATUS_LABEL, type Flag } from "@/lib/types";
import { cn, fetchJson, usd } from "@/lib/utils";

type Output = GenerationDTO["outputs"][number];

function toLightbox(o: Output): LightboxItem {
  return { id: o.id, kind: o.kind, urls: o.urls, width: o.width, height: o.height, durationSec: o.durationSec, filename: o.filename };
}

type Batch = { batchId: string; items: GenerationDTO[] };

function groupBatches(gens: GenerationDTO[]): Batch[] {
  const map = new Map<string, GenerationDTO[]>();
  for (const g of gens) {
    const arr = map.get(g.batchId) ?? [];
    arr.push(g);
    map.set(g.batchId, arr);
  }
  return Array.from(map.entries())
    .map(([batchId, items]) => ({ batchId, items }))
    .sort((a, b) => b.items[0].createdAt.localeCompare(a.items[0].createdAt));
}

export function ResultsFeed({
  kind,
  generations,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  onReuse,
  onFinalize,
  onUseAsReference,
  view = "batches",
  director,
}: {
  kind: "image" | "video";
  generations: GenerationDTO[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (items: LightboxItem[], index: number) => void;
  onReuse: (g: GenerationDTO) => void;
  onFinalize: (generationId: string) => void;
  onUseAsReference: (item: RefAsset) => void;
  /** batches: 요청별 묶음 · gallery: 큰 화면용 모자이크 */
  view?: "batches" | "gallery";
  /** 빈 화면 슬레이트에 적을 이름 */
  director?: string | null;
}) {
  const batches = React.useMemo(() => groupBatches(generations), [generations]);
  const allOutputs = React.useMemo(() => generations.flatMap((g) => g.outputs.map(toLightbox)), [generations]);
  const sentinel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) onLoadMore();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="skeleton h-4 w-64 rounded" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} className="skeleton aspect-square rounded-2xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!batches.length) {
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-6">
        <Slate director={director} label={kind === "image" ? "Image Studio" : "Video Studio"} className="animate-fade-up" />
        <p className="max-w-[340px] text-center text-[12.5px] leading-relaxed text-fg-4">
          아직 테이크가 없어요. 생성하면 여기부터 쌓여요. 이미지를 끌어오거나 붙여넣으면 레퍼런스로 들어가요.
        </p>
      </div>
    );
  }

  if (view === "gallery") {
    type GalleryTile = { g: GenerationDTO; out: GenerationDTO["outputs"][number] | null };
    const tiles: GalleryTile[] = generations.flatMap((g): GalleryTile[] =>
      g.outputs.length ? g.outputs.map((out) => ({ g, out })) : isActive(g) || g.status !== "completed" ? [{ g, out: null }] : [],
    );
    return (
      <div className="flex flex-col gap-6">
        <div className="columns-2 gap-3 md:columns-3 xl:columns-4 2xl:columns-5 [column-fill:_balance]">
          {tiles.map(({ g, out }, i) => (
            <div key={out?.id ?? `${g.id}-${i}`} className="mb-3 break-inside-avoid animate-fade-up">
              {out ? (
                <div className="group/gal relative">
                  <OutputTile
                    g={g}
                    out={out}
                    onOpen={() => {
                      const idx = allOutputs.findIndex((o) => o.id === out.id);
                      onOpen(allOutputs, Math.max(0, idx));
                    }}
                    onFinalize={() => onFinalize(g.id)}
                    onUseAsReference={() => onUseAsReference({ id: out.id, kind: out.kind, filename: out.filename, width: out.width, height: out.height, durationSec: out.durationSec, urls: out.urls })}
                  />
                  <button
                    type="button"
                    onClick={() => onReuse(g)}
                    className="mt-1.5 line-clamp-2 w-full px-0.5 text-left text-[11.5px] leading-snug text-fg-4 transition hover:text-fg-2"
                    title="클릭하면 이 프롬프트와 설정을 불러와요"
                  >
                    {g.prompt || "(프롬프트 없음)"}
                  </button>
                </div>
              ) : (
                <PendingTile g={g} ratio={typeof g.params.aspectRatio === "string" && g.params.aspectRatio.includes(":") ? g.params.aspectRatio : "1:1"} />
              )}
            </div>
          ))}
        </div>
        <div ref={sentinel} className="flex justify-center py-6">
          {loadingMore && <Loader2 className="size-5 animate-spin text-fg-3" />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {batches.map((b) => (
        <BatchCard
          key={b.batchId}
          batch={b}
          onOpen={(outputId) => {
            const idx = allOutputs.findIndex((o) => o.id === outputId);
            onOpen(allOutputs, Math.max(0, idx));
          }}
          onReuse={onReuse}
          onFinalize={onFinalize}
          onUseAsReference={onUseAsReference}
        />
      ))}
      <div ref={sentinel} className="flex justify-center py-6">
        {loadingMore && <Loader2 className="size-5 animate-spin text-fg-3" />}
      </div>
    </div>
  );
}

function paramChips(g: GenerationDTO): string[] {
  const p = g.params;
  const chips: string[] = [];
  if (typeof p.task === "string" && p.task !== "generate") chips.push(p.task === "edit" ? "영상 편집" : "영상 연장");
  if (typeof p.aspectRatio === "string") chips.push(p.aspectRatio);
  if (p.draft === true) chips.push("480p 드래프트");
  else if (typeof p.resolution === "string") chips.push(p.resolution);
  if (typeof p.duration === "number") chips.push(`${p.duration}초`);
  if (typeof p.quality === "string") chips.push(`품질 ${p.quality}`);
  if (typeof p.variant === "string") chips.push(p.variant === "sunburst" ? "Sunburst" : "Flare");
  if (g.workflow && !["text-to-image", "text-to-video"].includes(g.workflow)) chips.push(g.workflow);
  return chips;
}

function BatchCard({
  batch,
  onOpen,
  onReuse,
  onFinalize,
  onUseAsReference,
}: {
  batch: Batch;
  onOpen: (outputId: string) => void;
  onReuse: (g: GenerationDTO) => void;
  onFinalize: (id: string) => void;
  onUseAsReference: (item: RefAsset) => void;
}) {
  const first = batch.items[0];
  const model = getModel(first.modelId);
  const cost = batch.items.reduce((s, g) => s + (g.costMicros ?? g.estimatedCostMicros), 0);
  const running = batch.items.some(isActive);
  const ratio = typeof first.params.aspectRatio === "string" && /\d+:\d+/.test(first.params.aspectRatio) ? first.params.aspectRatio : first.kind === "video" ? "16:9" : "1:1";

  const tiles: { g: GenerationDTO; out?: Output; idx: number }[] = [];
  for (const g of batch.items) {
    if (g.outputs.length) g.outputs.forEach((o, i) => tiles.push({ g, out: o, idx: i }));
    else for (let i = 0; i < Math.max(1, g.expectedOutputs); i++) tiles.push({ g, idx: i });
  }
  const cols = first.kind === "video" ? "grid-cols-1 sm:grid-cols-2" : tiles.length === 1 ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-2 xl:grid-cols-4";

  return (
    <article className="group/batch flex flex-col gap-3 animate-fade-up">
      <header className="flex items-start gap-3">
        {model && <ModelSwatch model={model} className="mt-0.5 size-8" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {first.cutCode && <CutChip code={first.cutCode} takes={batch.items.flatMap((g) => g.outputs.map((o) => o.take)).filter((t): t is number => !!t)} />}
            <span className="text-[13px] font-semibold">{model?.name ?? first.modelId}</span>
            {paramChips(first).map((c) => (
              <span key={c} className="rounded-md bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] text-fg-3">
                {c}
              </span>
            ))}
            {first.isDraft && <span className="rounded-md bg-info/15 px-1.5 py-0.5 font-mono text-[10.5px] text-info">DRAFT 480p</span>}
            {first.workflow === "draft-complete" && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">1080p 완성본</span>}
            {first.parentGenerationId && first.workflow !== "draft-complete" && <span className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[10.5px] text-fg-3">드래프트에서 새로 생성</span>}
          </div>
          <button
            type="button"
            onClick={() => onReuse(first)}
            className="mt-1 line-clamp-2 text-left text-[13px] leading-relaxed text-fg-2 transition hover:text-fg"
            title="클릭하면 이 프롬프트와 설정을 불러와요"
          >
            {first.prompt || <span className="text-fg-4">(프롬프트 없음)</span>}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-fg-4">
          <span className="font-mono">{usd(cost)}</span>
          <TimeAgo date={first.createdAt} />
          <BatchMenu batch={batch} onReuse={() => onReuse(first)} />
        </div>
      </header>
      <div className={cn("grid gap-2.5", cols)}>
        {tiles.map(({ g, out, idx }) =>
          out ? (
            <OutputTile
              key={out.id}
              g={g}
              out={out}
              onOpen={() => onOpen(out.id)}
              onFinalize={() => onFinalize(g.id)}
              onUseAsReference={() => onUseAsReference({ id: out.id, kind: out.kind, filename: out.filename, width: out.width, height: out.height, durationSec: out.durationSec, urls: out.urls })}
            />
          ) : (
            <PendingTile key={`${g.id}-${idx}`} g={g} ratio={ratio} />
          ),
        )}
      </div>
      {running && <span className="sr-only">생성 중</span>}
    </article>
  );
}

/** 결과 묶음 머리의 컷·테이크 표시 (C003 · T07–T08) */
function CutChip({ code, takes }: { code: string; takes: number[] }) {
  const t = [...takes].sort((a, b) => a - b);
  const fmt = (n: number) => `T${String(n).padStart(2, "0")}`;
  const range = t.length ? (t.length === 1 ? fmt(t[0]) : `${fmt(t[0])}–${fmt(t.at(-1)!)}`) : null;
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-md border border-line-2 px-1.5 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-fg-2">
      {code}
      {range && <span className="font-normal text-fg-3">· {range}</span>}
    </span>
  );
}

function BatchMenu({ batch, onReuse }: { batch: Batch; onReuse: () => void }) {
  const outs = batch.items.flatMap((g) => g.outputs);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="opacity-60 group-hover/batch:opacity-100" aria-label="더보기">
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={onReuse}>
          <RefreshCw /> 설정 불러오기
        </MenuItem>
        <MenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(batch.items[0].prompt);
            toast("프롬프트를 복사했어요.");
          }}
        >
          <Copy /> 프롬프트 복사
        </MenuItem>
        {outs.length > 1 && (
          <MenuItem
            onSelect={() => {
              toast("ZIP으로 묶는 중…");
              void downloadZip(
                outs.map((o) => ({ url: o.urls.download, filename: o.filename })),
                `zipup_${new Date().toISOString().slice(0, 10)}.zip`,
              );
            }}
          >
            <Download /> 모두 다운로드 (ZIP)
          </MenuItem>
        )}
        {batch.items.some((g) => g.status === "pending" || g.status === "queued") && (
          <>
            <MenuSeparator />
            <MenuItem
              danger
              onSelect={async () => {
                for (const g of batch.items.filter((x) => x.status === "pending" || x.status === "queued")) {
                  try {
                    await cancelGenerationRequest(g.id);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }
              }}
            >
              <X /> 대기 중인 작업 취소
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

function OutputTile({
  g,
  out,
  onOpen,
  onFinalize,
  onUseAsReference,
}: {
  g: GenerationDTO;
  out: Output;
  onOpen: () => void;
  onFinalize: () => void;
  onUseAsReference: () => void;
}) {
  const router = useRouter();
  const { update } = useAssetMutations();
  const [rating, setRating] = React.useState(out.rating);
  const [verdict, setVerdict] = React.useState<Flag | null>(out.flag);
  const [sharing, setSharing] = React.useState(false);
  const [fav, setFav] = React.useState(false);
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-line bg-panel-2"
      style={{ aspectRatio: aspectFrom(out.width, out.height) }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/x-zipup-asset",
          JSON.stringify({ id: out.id, kind: out.kind, filename: out.filename, width: out.width, height: out.height, durationSec: out.durationSec, urls: out.urls }),
        );
      }}
    >
      <button type="button" onClick={onOpen} className="absolute inset-0 z-0 cursor-zoom-in" aria-label="크게 보기">
        <MediaThumb kind={out.kind} thumb={out.urls.thumb} src={out.urls.src} durationSec={out.durationSec} />
      </button>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <TileButton label="즐겨찾기" onClick={() => { setFav(!fav); void update([out.id], { favorite: !fav }); }}>
          <Heart className={cn(fav && "fill-[#ff5b8a] text-[#ff5b8a]")} />
        </TileButton>
        <TileButton label="다운로드" onClick={() => downloadUrl(out.urls.download, out.filename)}>
          <Download />
        </TileButton>
        {g.prompt && (
          <TileButton label="프롬프트 공유 — 이 클립과 함께 게시판에" onClick={() => setSharing(true)}>
            <Share2 />
          </TileButton>
        )}
      </div>
      <ShareDialog open={sharing} onOpenChange={setSharing} assetId={out.id} preview={{ thumb: out.kind === "image" ? out.urls.thumb : out.urls.src, kind: out.kind, prompt: g.prompt }} />
      {(verdict || out.take) && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 transition-opacity group-hover:opacity-0">
          {out.take && <span className="rounded-[5px] bg-black/55 px-1.5 py-[2px] font-mono text-[9.5px] text-white/90 backdrop-blur">T{String(out.take).padStart(2, "0")}</span>}
          <VerdictBadge flag={verdict} />
        </div>
      )}
      <div className="absolute left-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
        {(["pick", "keep", "reject"] as const).map((f) => (
          <Tip key={f} content={f === "pick" ? "OK — 쓸 테이크" : f === "keep" ? "KEEP — 보류" : "NG — 안 씀"}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = verdict === f ? null : f;
                setVerdict(next);
                void update([out.id], { flag: next });
              }}
              className={cn(
                "h-6 rounded-md px-1.5 font-mono text-[9.5px] font-bold tracking-[0.06em] backdrop-blur transition",
                verdict === f ? VERDICT_STYLE[f].solid : "bg-black/45 text-white/80 hover:bg-black/70",
              )}
            >
              {FLAG_LABEL[f]}
            </button>
          </Tip>
        ))}
      </div>
      <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-2 opacity-0 transition group-hover:opacity-100">
        <div className="rounded-lg bg-black/45 px-1 py-0.5 backdrop-blur">
          <StarRating value={rating} size={13} onChange={(v) => { setRating(v); void update([out.id], { rating: v }); }} />
        </div>
        <div className="flex gap-1">
          <TileButton label="레퍼런스로 추가" onClick={onUseAsReference}>
            <ImagePlus />
          </TileButton>
          {out.kind === "image" && (
            <TileButton label="영상으로 만들기" onClick={() => router.push(`/create/video?start=${out.id}`)}>
              <Clapperboard />
            </TileButton>
          )}
          {g.isDraft && (
            <Tip content={g.draftCompletable ? "같은 테이크 그대로 1080p로 완성" : "최종 버전 만들기"}>
              <button
                type="button"
                onClick={onFinalize}
                className="flex h-7 items-center gap-1 rounded-lg bg-white px-2 text-[11px] font-semibold text-black shadow"
              >
                <Sparkles className="size-3" /> {g.draftCompletable ? "1080p 완성" : "최종"}
              </button>
            </Tip>
          )}
        </div>
      </div>
    </div>
  );
}

function TileButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip content={label}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex size-7 items-center justify-center rounded-lg bg-black/45 text-white/90 backdrop-blur transition hover:bg-black/70 [&_svg]:size-3.5"
        aria-label={label}
      >
        {children}
      </button>
    </Tip>
  );
}

function Elapsed({ since }: { since: string }) {
  const now = useNow(1000);
  if (!now) return null;
  const s = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  return <span>{s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`}</span>;
}


function PendingTile({ g, ratio }: { g: GenerationDTO; ratio: string }) {
  const failed = g.status === "failed" || g.status === "nsfw" || g.status === "canceled";
  const now = useNow(1000);
  return (
    <div
      className={cn("relative overflow-hidden rounded-2xl border", failed ? "border-danger/25 bg-danger/[0.04]" : "generating border-line")}
      style={{ aspectRatio: ratio.replace(":", " / ") }}
    >
      <div className="relative z-10 flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
        {failed ? (
          <>
            <AlertTriangle className="size-5 text-danger" />
            <p className="text-[12.5px] font-medium text-danger">{GENERATION_STATUS_LABEL[g.status]}</p>
            <p className="line-clamp-3 max-w-[260px] text-[11.5px] text-fg-3">{g.errorMessage}</p>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 text-[12.5px] font-medium text-fg-2">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" />
              {GENERATION_STATUS_LABEL[g.status]}
            </span>
            <span className="font-mono text-[11px] text-fg-4">
              <Elapsed since={g.startedAt ?? g.createdAt} />
            </span>
            {g.status === "pending" && now > 0 && now - new Date(g.createdAt).getTime() > 8000 && (
              <span className="text-[11px] text-fg-4">동시 실행 한도로 잠시 대기 중이에요</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ 최종 렌더 다이얼로그 ------------------------------ */

export function FinalizeDialog({
  generationId,
  onOpenChange,
  generations,
  status,
}: {
  generationId: string | null;
  onOpenChange: (v: boolean) => void;
  generations: GenerationDTO[];
  status: Record<string, ModelStatus>;
}) {
  const push = usePushGenerations();
  const g = generations.find((x) => x.id === generationId);
  const completable = !!g?.draftCompletable;
  const [picked, setMode] = React.useState<"complete" | "regenerate" | null>(null);
  const mode = picked ?? (completable ? "complete" : "regenerate");
  const [regenRes, setRegenRes] = React.useState<"720p" | "1080p">("1080p");
  const [loading, setLoading] = React.useState(false);
  const now = useNow(60_000);

  const overrides = status["seedance-2-5"]?.priceOverrides ?? {};
  const duration = typeof g?.params.duration === "number" ? g.params.duration : 5;
  const draftSeconds = Math.max(4, Math.round(g?.outputs[0]?.durationSec ?? duration));
  const completeCost = seedanceCompleteUsd(draftSeconds, overrides);
  const regenCost =
    regenRes === "1080p"
      ? seedanceCompleteUsd(duration, overrides)
      : (seedanceTokens("720p", duration) / 1000) * (overrides.per1kTokens ?? 0.0214);
  const daysLeft = g?.draftExpiresAt && now ? Math.max(0, Math.ceil((new Date(g.draftExpiresAt).getTime() - now) / 86400_000)) : null;

  async function run() {
    if (!g) return;
    setLoading(true);
    try {
      const res = await fetchJson<{ generations: GenerationDTO[] }>(`/api/generations/${g.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({ mode, resolution: regenRes }),
      });
      push(res.generations);
      toast.success(mode === "complete" ? "같은 테이크를 1080p로 완성하고 있어요." : `${regenRes}로 새로 생성하고 있어요.`);
      onOpenChange(false);
      setMode(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const option = (value: "complete" | "regenerate", title: React.ReactNode, desc: React.ReactNode, cost: number, disabled?: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setMode(value)}
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
        mode === value ? "border-fg bg-panel-2" : "border-line-2 hover:border-line-3",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold">{title}</span>
        <span className="font-mono text-[12px] text-fg-2">약 ${cost.toFixed(2)}</span>
      </span>
      <span className="text-[12.5px] leading-relaxed text-fg-3">{desc}</span>
    </button>
  );

  return (
    <Dialog open={!!generationId} onOpenChange={(o) => { if (!o) setMode(null); onOpenChange(o); }}>
      <DialogContent title="드래프트 완성" description="마음에 드는 드래프트를 고화질로 뽑아요.">
        <DialogBody className="flex flex-col gap-3">
          {option(
            "complete",
            <span className="flex items-center gap-2">
              같은 테이크 그대로 1080p <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">공식 드래프트</span>
            </span>,
            completable ? (
              <>
                Seedance 공식 드래프트 완성 기능이에요. 구도·움직임·연기·오디오를 그대로 유지한 채 1080p로 렌더해요.
                {daysLeft !== null && <b className="ml-1 font-medium text-fg-2">완성 가능 기간 {daysLeft}일 남음</b>}
              </>
            ) : (
              "이 드래프트는 완성용 ID가 없어요. (fal.ai로 만든 드래프트만 7일 안에 완성할 수 있어요)"
            ),
            completeCost,
            !completable,
          )}
          {option(
            "regenerate",
            <span className="flex items-center gap-2">
              같은 설정으로 새로 생성
              <span onClick={(e) => e.stopPropagation()}>
                <Segmented
                  size="xs"
                  value={regenRes}
                  onChange={setRegenRes}
                  options={[
                    { value: "720p", label: "720p" },
                    { value: "1080p", label: "1080p" },
                  ]}
                />
              </span>
            </span>,
            "같은 프롬프트·레퍼런스로 새로 만들어요. 다른 테이크가 나와요.",
            regenCost,
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="primary" loading={loading} onClick={run} disabled={!g}>
            <Sparkles /> {mode === "complete" ? "1080p로 완성" : "새로 생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
