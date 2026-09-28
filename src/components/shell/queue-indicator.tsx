"use client";

import { CircleCheck, CircleX, Layers, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Tip } from "@/components/ui/menu";
import { EmptyState, TimeAgo } from "@/components/ui/misc";
import {
  cancelGenerationRequest,
  isActive,
  useActiveGenerations,
  type GenerationDTO,
} from "@/lib/client/generations";
import { getModel } from "@/lib/models/registry";
import { GENERATION_STATUS_LABEL } from "@/lib/types";
import { cn, usd } from "@/lib/utils";

export function QueueIndicator() {
  const { data = [], refetch } = useActiveGenerations();
  const active = data.filter(isActive);
  const prev = React.useRef<Map<string, string>>(new Map());

  // 완료/실패 토스트
  React.useEffect(() => {
    for (const g of data) {
      const before = prev.current.get(g.id);
      if (before && before !== g.status) {
        const model = getModel(g.modelId);
        if (g.status === "completed") {
          toast.success(`${model?.shortName ?? g.modelId} 완성`, {
            description: g.prompt.slice(0, 60) || undefined,
            action: g.outputs[0] ? { label: "보기", onClick: () => (window.location.href = `/library?asset=${g.outputs[0].id}`) } : undefined,
          });
        } else if (g.status === "failed" || g.status === "nsfw") {
          toast.error(`${model?.shortName ?? g.modelId} ${g.status === "nsfw" ? "차단됨" : "실패"}`, {
            description: g.errorMessage ?? undefined,
          });
        }
      }
    }
    prev.current = new Map(data.map((g) => [g.id, g.status]));
  }, [data]);

  return (
    <Popover>
      <Tip content="작업 대기열">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="relative" aria-label="작업 대기열">
            {active.length ? (
              <span className="relative flex size-[18px] items-center justify-center">
                <svg className="absolute inset-0 animate-spin" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8.5" fill="none" stroke="var(--line-2)" strokeWidth="2" />
                  <path d="M10 1.5a8.5 8.5 0 0 1 8.5 8.5" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="font-mono text-[9.5px] font-bold">{active.length}</span>
              </span>
            ) : (
              <Layers />
            )}
          </Button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">작업 대기열</span>
            {active.length > 0 && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10.5px] text-accent">{active.length} 진행 중</span>}
          </div>
          <Link href="/library" className="text-xs text-fg-3 hover:text-fg">
            라이브러리 →
          </Link>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2 scrollbar-thin">
          {data.length === 0 ? (
            <EmptyState icon={<Layers />} title="진행 중인 작업이 없어요" description="생성을 시작하면 여기서 상태를 볼 수 있어요." className="py-10" />
          ) : (
            data.slice(0, 20).map((g) => <QueueRow key={g.id} g={g} onChanged={() => refetch()} />)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QueueRow({ g, onChanged }: { g: GenerationDTO; onChanged: () => void }) {
  const model = getModel(g.modelId);
  const running = isActive(g);
  const thumb = g.outputs[0]?.urls.thumb;
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-panel-2">
      <div className={cn("relative size-11 shrink-0 overflow-hidden rounded-lg", running ? "generating" : "bg-panel-3")}>
        {thumb &&
          (g.kind === "video" ? (
            <video src={`${g.outputs[0].urls.src}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover" />
          ))}
        {!running && !thumb && (
          <span className="absolute inset-0 flex items-center justify-center text-fg-3">
            {g.status === "nsfw" ? <ShieldAlert className="size-4" /> : <CircleX className="size-4" />}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{model?.shortName ?? g.modelId}</span>
          {g.isDraft && <span className="rounded bg-info/15 px-1 font-mono text-[9.5px] text-info">DRAFT</span>}
        </div>
        <p className="truncate text-xs text-fg-3">{g.prompt || "(프롬프트 없음)"}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-4">
          <span className={cn("inline-flex items-center gap-1", running && "text-accent", g.status === "completed" && "text-success", (g.status === "failed" || g.status === "nsfw") && "text-danger")}>
            {running ? <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" /> : g.status === "completed" ? <CircleCheck className="size-3" /> : null}
            {GENERATION_STATUS_LABEL[g.status]}
          </span>
          <span>·</span>
          <TimeAgo date={g.createdAt} />
          <span>·</span>
          <span className="font-mono">{usd(g.costMicros ?? g.estimatedCostMicros)}</span>
        </div>
      </div>
      {(g.status === "pending" || g.status === "queued") && (
        <Tip content="취소">
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100"
            onClick={async () => {
              try {
                await cancelGenerationRequest(g.id);
                toast("작업을 취소했어요.");
                onChanged();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <X />
          </Button>
        </Tip>
      )}
    </div>
  );
}
