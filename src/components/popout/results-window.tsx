"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLeftOpen, Radio } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { BrandLockup } from "@/components/brand/logo";
import { Lightbox, type LightboxItem } from "@/components/assets/lightbox";
import { type ModelStatus } from "@/components/studio/model-picker";
import { FinalizeDialog, ResultsFeed } from "@/components/studio/results-feed";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { useResultsView } from "@/lib/client/use-results-view";
import { isActive, useActiveGenerations, usePushGenerations, type GenerationDTO } from "@/lib/client/generations";
import { useStudioChannel } from "@/lib/client/studio-channel";
import { cn, fetchJson } from "@/lib/utils";

/** 듀얼 모니터: 다른 모니터에 띄우는 결과 창 */
export function ResultsWindow({ kind, status }: { kind: "image" | "video"; status: Record<string, ModelStatus> }) {
  const qc = useQueryClient();
  const push = usePushGenerations();
  const [lightbox, setLightbox] = React.useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [finalizeId, setFinalizeId] = React.useState<string | null>(null);
  const [deskSeen, setDeskSeen] = React.useState(0);
  const [clock, setClock] = React.useState(0);
  const windowId = React.useId();
  const top = React.useRef<HTMLDivElement>(null);
  const [view, setView] = useResultsView("popout", "gallery");

  const post = useStudioChannel((m) => {
    if (m.kind !== kind) return;
    if (m.type === "desk-alive") setDeskSeen(Date.now());
    if (m.type === "submitted") {
      push(m.generations);
      setDeskSeen(Date.now());
      top.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  // 프롬프트 창에 살아 있다고 알림
  React.useEffect(() => {
    const beat = () => {
      post({ type: "results-alive", kind, windowId });
      setClock(Date.now());
    };
    beat();
    const t = setInterval(beat, 2000);
    const bye = () => post({ type: "results-closed", kind, windowId });
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", bye);
      bye();
    };
  }, [post, kind, windowId]);

  const history = useInfiniteQuery({
    queryKey: ["generations", "history", kind],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      fetchJson<{ items: GenerationDTO[] }>(`/api/generations?kind=${kind}&limit=30${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`).then((r) => r.items),
    getNextPageParam: (last) => (last.length >= 30 ? new Date(new Date(last[last.length - 1].createdAt).getTime() - 1).toISOString() : undefined),
  });
  const { data: active = [] } = useActiveGenerations();
  const merged = React.useMemo(() => {
    const map = new Map<string, GenerationDTO>();
    for (const g of history.data?.pages.flat() ?? []) map.set(g.id, g);
    for (const g of active) if (g.kind === kind) map.set(g.id, g);
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [history.data, active, kind]);

  const activeIds = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const now = new Set(active.filter(isActive).map((g) => g.id));
    const finished = [...activeIds.current].some((id) => !now.has(id));
    activeIds.current = now;
    if (finished) void qc.invalidateQueries({ queryKey: ["generations", "history", kind] });
  }, [active, qc, kind]);

  const running = active.filter((g) => g.kind === kind && isActive(g)).length;
  const linked = deskSeen > 0 && clock - deskSeen < 6000;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl">
        <BrandLockup />
        <span className="ml-1 text-[13px] font-semibold">{kind === "image" ? "이미지" : "영상"} 결과</span>
        <span className={cn("flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors", linked ? "bg-success/12 text-success" : "bg-panel-2 text-fg-3")}>
          <Radio className={cn("size-3", linked && "animate-pulse")} /> {linked ? "프롬프트 창과 연결됨" : "프롬프트 창을 기다리는 중"}
        </span>
        {running > 0 && <span className="text-[11.5px] text-fg-3">생성 중 {running}건</span>}
        <Segmented
          size="xs"
          value={view}
          onChange={setView}
          className="ml-auto"
          options={[
            { value: "gallery", label: "갤러리" },
            { value: "batches", label: "요청별" },
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            post({ type: "focus-prompt", kind });
            window.opener?.focus?.();
          }}
        >
          <PanelLeftOpen /> 프롬프트 창으로
        </Button>
      </header>
      <div ref={top} />
      <main className="mx-auto max-w-[2000px] p-4 sm:p-6">
        <ResultsFeed
          kind={kind}
          generations={merged}
          loading={history.isLoading}
          hasMore={!!history.hasNextPage}
          loadingMore={history.isFetchingNextPage}
          onLoadMore={() => history.fetchNextPage()}
          onOpen={(items, index) => setLightbox({ items, index })}
          onReuse={(g) => {
            post({ type: "reuse", kind, generation: g });
            toast.success("프롬프트 창에 불러왔어요.");
          }}
          onFinalize={(id) => setFinalizeId(id)}
          onUseAsReference={(item) => {
            post({ type: "use-as-reference", kind, item });
            toast.success("프롬프트 창의 레퍼런스에 넣었어요.");
          }}
          view={view}
        />
      </main>
      {lightbox && (
        <Lightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((l) => (l ? { ...l, index } : l))}
          onClose={() => setLightbox(null)}
          onFinalize={(id) => setFinalizeId(id)}
        />
      )}
      <FinalizeDialog generationId={finalizeId} onOpenChange={(o) => !o && setFinalizeId(null)} generations={merged} status={status} />
    </div>
  );
}
