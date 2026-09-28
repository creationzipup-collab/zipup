"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, BookText, FolderKanban, Megaphone, Minus, Plus, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Lightbox, type LightboxItem } from "@/components/assets/lightbox";
import { PromptLibraryDialog, SavePromptDialog } from "@/components/prompts/prompt-dialogs";
import { useShell } from "@/components/shell/app-shell";
import { ModelPicker, ProviderTag, type ModelStatus } from "@/components/studio/model-picker";
import { ParamControls } from "@/components/studio/param-controls";
import { EMPTY_INPUTS, ReferenceSlots, type StudioInputs } from "@/components/studio/reference-slots";
import { FinalizeDialog, ResultsFeed } from "@/components/studio/results-feed";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import { Tip } from "@/components/ui/menu";
import { Kbd } from "@/components/ui/misc";
import {
  createGenerationRequest,
  isActive,
  useActiveGenerations,
  usePushGenerations,
  type GenerationDTO,
} from "@/lib/client/generations";
import { defaultParams, IMAGE_MODELS, sanitizeParams, VIDEO_MODELS } from "@/lib/models/registry";
import type { ModelDef } from "@/lib/models/types";
import type { EditableProject, StudioPrefill } from "@/lib/services/studio";
import { cn, fetchJson, usd } from "@/lib/utils";

const INSPIRATION: Record<"image" | "video", string[]> = {
  image: [
    "새벽 안개가 낀 서울 골목, 네온 간판이 젖은 아스팔트에 반사되는 시네마틱 스틸, 35mm 필름 그레인",
    "투명한 유리 소재의 향수병 제품 사진, 부드러운 스튜디오 조명, 파스텔 그라디언트 배경, 미니멀",
    "K-pop 아이돌 컨셉 포토, 크롬 액세서리와 테크웨어 의상, 하이패션 에디토리얼, 강한 역광",
    "귀여운 3D 마스코트 캐릭터 턴어라운드 시트, 정면·측면·후면, 흰 배경, 일관된 비율",
    "포스터 디자인: 'ZIPUP SUMMER' 대형 타이포그래피, 바다와 태양, Y2K 그래픽 스타일",
  ],
  video: [
    "비 오는 밤 도심을 달리는 오토바이를 따라가는 트래킹 샷, 네온 반사, 슬로우 모션, 시네마틱",
    "무대 위 아이돌이 조명 속에서 회전하며 춤추는 장면, 카메라가 천천히 원을 그리며 이동",
    "제품이 공중에서 천천히 회전하고 빛이 표면을 훑고 지나가는 광고 컷, 검은 배경",
    "드론 샷: 새벽 안개가 깔린 산맥 위를 날아가며 해가 떠오르는 장면",
  ],
};

type Stored = { modelId?: string; paramsByModel?: Record<string, Record<string, unknown>>; count?: number; projectId?: string };

function loadStored(kind: string): Stored {
  try {
    return JSON.parse(localStorage.getItem(`zipup:studio:${kind}`) ?? "{}") as Stored;
  } catch {
    return {};
  }
}

export function Studio({
  kind,
  status,
  projects,
  prefill,
}: {
  kind: "image" | "video";
  status: Record<string, ModelStatus>;
  projects: EditableProject[];
  prefill: StudioPrefill;
}) {
  const { budget } = useShell();
  const router = useRouter();
  const models: ModelDef[] = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const qc = useQueryClient();
  const push = usePushGenerations();
  const usable = (m: ModelDef) => status[m.id]?.enabled !== false && !!status[m.id]?.provider;

  const [modelId, setModelId] = React.useState<string>(() => prefill.modelId ?? models.find(usable)?.id ?? models[0].id);
  const [paramsByModel, setParamsByModel] = React.useState<Record<string, Record<string, unknown>>>(() =>
    prefill.modelId && prefill.params ? { [prefill.modelId]: prefill.params } : {},
  );
  const [prompt, setPrompt] = React.useState(prefill.prompt ?? "");
  const [inputs, setInputs] = React.useState<StudioInputs>(() => ({ ...EMPTY_INPUTS, ...(prefill.inputs ?? {}) }));
  const [count, setCount] = React.useState(1);
  const [projectId, setProjectId] = React.useState<string>(prefill.projectId ?? projects[0]?.id);
  const [submitting, setSubmitting] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [finalizeId, setFinalizeId] = React.useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const promptRef = React.useRef<HTMLTextAreaElement>(null);
  const hydrated = React.useRef(false);

  // 이전 설정 복원 (프리필이 없을 때). localStorage는 마운트 후에만 읽을 수 있어 effect에서 처리
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const s = loadStored(kind);
    if (!prefill.modelId && s.modelId && models.some((m) => m.id === s.modelId && usable(m))) setModelId(s.modelId);
    if (s.paramsByModel) setParamsByModel((p) => ({ ...s.paramsByModel, ...p }));
    if (s.count) setCount(s.count);
    if (!prefill.projectId && s.projectId && projects.some((p) => p.id === s.projectId)) setProjectId(s.projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const model = models.find((m) => m.id === modelId) ?? models[0];
  const params = React.useMemo(
    () => sanitizeParams(model, { ...defaultParams(model), ...(paramsByModel[model.id] ?? {}) }),
    [model, paramsByModel],
  );
  const slots = model.inputsFor(params);

  React.useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(`zipup:studio:${kind}`, JSON.stringify({ modelId, paramsByModel, count, projectId }));
    } catch {}
  }, [kind, modelId, paramsByModel, count, projectId]);

  // 모델·작업 종류가 바뀌어 슬롯이 사라지면 입력 정리
  const slotKey = `${model.id}:${String(params.task ?? "")}`;
  const [prevSlotKey, setPrevSlotKey] = React.useState(slotKey);
  if (prevSlotKey !== slotKey) {
    setPrevSlotKey(slotKey);
    setInputs((v) => ({
      images: slots.images ? v.images.slice(0, slots.images.max) : [],
      videos: slots.videos ? v.videos.slice(0, slots.videos.max) : [],
      startFrame: slots.startFrame ? v.startFrame : undefined,
      endFrame: slots.endFrame ? v.endFrame : undefined,
    }));
  }

  const effectiveCount = Math.min(count, model.count.max);
  const perRequest = model.count.native ? [effectiveCount] : Array.from({ length: effectiveCount }, () => 1);
  const estimateUsd = perRequest.reduce(
    (sum, n) =>
      sum +
      model.estimate(
        {
          params,
          count: n,
          refImages: inputs.images.length,
          hasStartFrame: !!inputs.startFrame,
          refVideos: inputs.videos.length,
          inputVideoSeconds: inputs.videos[0]?.durationSec ?? 0,
          now: new Date(),
        },
        status[model.id]?.priceOverrides ?? {},
      ),
    0,
  );
  const estimateMicros = Math.round(estimateUsd * 1_000_000);

  const validation = model.validate?.({
    prompt,
    params,
    refImages: inputs.images.length,
    hasStartFrame: !!inputs.startFrame,
    refVideos: inputs.videos.length,
    refAudios: 0,
  });

  const teamLeft = budget.team?.cap != null ? budget.team.cap - budget.team.spent : null;
  const userLeft = budget.user.cap != null ? budget.user.cap - budget.user.spent : null;
  const left = [teamLeft, userLeft].filter((x): x is number => x !== null).sort((a, b) => a - b)[0] ?? null;
  const overBudget = left !== null && estimateMicros > left;
  const st = status[model.id];
  const disabledReason = !st?.provider ? "API 키가 설정되지 않은 모델이에요" : st.enabled === false ? "관리자가 비활성화한 모델이에요" : overBudget ? "예산이 부족해요" : validation;

  async function submit() {
    if (disabledReason || submitting) {
      if (disabledReason) toast.error(disabledReason);
      return;
    }
    setSubmitting(true);
    try {
      const res = await createGenerationRequest({
        modelId: model.id,
        prompt,
        params,
        inputs: {
          images: inputs.images.map((a) => a.id),
          videos: inputs.videos.map((a) => a.id),
          startFrame: inputs.startFrame?.id,
          endFrame: inputs.endFrame?.id,
        },
        count: effectiveCount,
        projectId,
      });
      push(res.generations);
      router.refresh();
      toast.success(`${model.shortName} 생성을 시작했어요`, { description: `${res.generations.length}건 · 예상 ${usd(estimateMicros)}` });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ⌘/Ctrl + Enter
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* --------------------------------- 결과 --------------------------------- */

  const history = useInfiniteQuery({
    queryKey: ["generations", "history", kind],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      fetchJson<{ items: GenerationDTO[] }>(`/api/generations?kind=${kind}&limit=24${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`).then((r) => r.items),
    getNextPageParam: (last) => (last.length >= 24 ? new Date(new Date(last[last.length - 1].createdAt).getTime() - 1).toISOString() : undefined),
  });
  const { data: active = [] } = useActiveGenerations();

  const merged = React.useMemo(() => {
    const map = new Map<string, GenerationDTO>();
    for (const g of history.data?.pages.flat() ?? []) map.set(g.id, g);
    for (const g of active) if (g.kind === kind) map.set(g.id, g);
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [history.data, active, kind]);

  // 진행 중이던 작업이 끝나면 기록 새로고침
  const activeIds = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const now = new Set(active.filter(isActive).map((g) => g.id));
    const finished = [...activeIds.current].some((id) => !now.has(id));
    activeIds.current = now;
    if (finished) void qc.invalidateQueries({ queryKey: ["generations", "history", kind] });
  }, [active, qc, kind]);

  const pendingAhead = active.filter((g) => g.status === "pending").length;

  function reuse(g: GenerationDTO) {
    if (g.modelId !== model.id && models.some((m) => m.id === g.modelId)) setModelId(g.modelId);
    setParamsByModel((p) => ({ ...p, [g.modelId]: g.params }));
    setPrompt(g.prompt);
    promptRef.current?.focus();
    toast("설정을 불러왔어요. 레퍼런스는 라이트박스의 '이 설정으로 다시'로 함께 불러올 수 있어요.");
  }

  return (
    <div className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-[400px_1fr]">
      {/* ------------------------------ 설정 패널 ------------------------------ */}
      <section className="flex flex-col border-line lg:sticky lg:top-14 lg:h-[calc(100dvh-56px)] lg:border-r" data-hotkeys-scope>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 pb-2 scrollbar-thin sm:p-5">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{kind === "image" ? "Image Studio" : "Video Studio"}</span>
            <ProviderTag status={st} model={model} />
          </div>

          <ModelPicker
            models={models}
            value={model}
            status={status}
            onChange={(m) => setModelId(m.id)}
          />
          {st?.notes && (
            <p className="-mt-3 flex gap-2 rounded-xl border border-info/25 bg-info/8 px-3 py-2 text-[12px] leading-relaxed text-fg-2">
              <Megaphone className="mt-0.5 size-3.5 shrink-0 text-info" />
              {st.notes}
            </p>
          )}

          {/* 프롬프트 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-fg-2">프롬프트</span>
              <div className="flex items-center gap-0.5">
                <Tip content="영감 받기">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      const list = INSPIRATION[kind];
                      setPrompt(list[Math.floor(Math.random() * list.length)]);
                    }}
                  >
                    <Wand2 />
                  </Button>
                </Tip>
                <Tip content="프롬프트 라이브러리">
                  <Button variant="ghost" size="icon-xs" onClick={() => setLibraryOpen(true)}>
                    <BookText />
                  </Button>
                </Tip>
                <Tip content="프롬프트 저장">
                  <Button variant="ghost" size="icon-xs" disabled={!prompt.trim()} onClick={() => setSaveOpen(true)}>
                    <BookmarkPlus />
                  </Button>
                </Tip>
              </div>
            </div>
            <div className="rounded-2xl border border-line-2 bg-panel-2/60 transition focus-within:border-fg-3 focus-within:bg-panel-2">
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder={
                  kind === "image"
                    ? "만들고 싶은 장면을 자세히 적어 주세요. 한국어도 좋아요.\n예) 비 오는 밤 네온 거리의 인물 클로즈업, 시네마틱"
                    : "장면, 움직임, 카메라 무빙, 소리를 적어 주세요.\n예) 카메라가 천천히 다가가며 인물이 뒤돌아본다"
                }
                className="block max-h-[40vh] min-h-[132px] w-full resize-y bg-transparent px-3.5 pt-3 text-[14px] leading-relaxed outline-none placeholder:text-fg-4"
              />
              <div className="flex items-center justify-between px-3.5 pb-2.5 pt-1">
                <span className="font-mono text-[10.5px] text-fg-4">{prompt.length} / 5000</span>
                <span className="text-[10.5px] text-fg-4">
                  <Kbd>⌘</Kbd> <Kbd>↵</Kbd> 생성
                </span>
              </div>
            </div>
          </div>

          <ReferenceSlots slots={slots} value={inputs} onChange={setInputs} projectId={projectId} />

          <ParamControls
            model={model}
            params={params}
            onChange={(next) => setParamsByModel((p) => ({ ...p, [model.id]: next }))}
          />

          {/* 저장 위치 */}
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
              <FolderKanban className="size-3.5" /> 저장할 프로젝트
            </span>
            <Select
              value={projectId}
              onValueChange={setProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.isPersonal ? `🔒 ${p.name}` : p.name }))}
              className="w-full"
            />
          </div>
          {model.priceNote && <p className="text-[11px] leading-relaxed text-fg-4">{model.priceNote}</p>}
        </div>

        {/* 생성 바 */}
        <div className="border-t border-line bg-bg-2/80 p-4 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-[10px] border border-line-2 bg-panel-2/60">
              <button
                type="button"
                className="flex size-10 items-center justify-center text-fg-3 hover:text-fg disabled:opacity-30"
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                disabled={effectiveCount <= 1}
                aria-label="개수 줄이기"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-6 text-center font-mono text-sm">{effectiveCount}</span>
              <button
                type="button"
                className="flex size-10 items-center justify-center text-fg-3 hover:text-fg disabled:opacity-30"
                onClick={() => setCount((c) => Math.min(model.count.max, c + 1))}
                disabled={effectiveCount >= model.count.max}
                aria-label="개수 늘리기"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <Tip content={disabledReason ?? undefined}>
              <span className="flex-1">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={submit}
                  loading={submitting}
                  disabled={!!disabledReason}
                  className={cn("glow-ring h-10 w-full justify-between rounded-[12px] px-4", !disabledReason && "shadow-[0_0_32px_-8px_var(--accent)]")}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles /> {params.draft ? "드래프트 생성" : "생성하기"}
                  </span>
                  <span className="font-mono text-[12.5px] opacity-70">{usd(estimateMicros)}</span>
                </Button>
              </span>
            </Tip>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-fg-4">
            <span>
              {left !== null ? (
                <span className={cn(overBudget && "text-danger")}>남은 예산 {usd(Math.max(0, left))}</span>
              ) : (
                "예산 한도 없음"
              )}
            </span>
            <span>{pendingAhead > 0 ? `대기열 ${pendingAhead}건` : "예상 비용 · 실패 시 환불"}</span>
          </div>
        </div>
      </section>

      {/* ------------------------------ 결과 피드 ------------------------------ */}
      <section className="min-w-0 p-4 sm:p-6">
        <ResultsFeed
          kind={kind}
          generations={merged}
          loading={history.isLoading}
          hasMore={!!history.hasNextPage}
          loadingMore={history.isFetchingNextPage}
          onLoadMore={() => history.fetchNextPage()}
          onOpen={(items, index) => setLightbox({ items, index })}
          onReuse={reuse}
          onFinalize={(id) => setFinalizeId(id)}
          onUseAsReference={(item) => {
            if (item.kind === "image" && slots.images) setInputs((v) => ({ ...v, images: [...v.images.filter((x) => x.id !== item.id), item].slice(0, slots.images!.max) }));
            else if (item.kind === "image" && slots.startFrame) setInputs((v) => ({ ...v, startFrame: item }));
            else if (item.kind === "video" && slots.videos) setInputs((v) => ({ ...v, videos: [item, ...v.videos].slice(0, slots.videos!.max) }));
            toast("레퍼런스로 추가했어요.");
          }}
        />
      </section>

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
      <PromptLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        kind={kind}
        onUse={(p) => {
          setPrompt(p.prompt);
          if (p.modelId && models.some((m) => m.id === p.modelId)) setModelId(p.modelId);
          if (p.modelId && p.params) setParamsByModel((x) => ({ ...x, [p.modelId!]: p.params! }));
        }}
      />
      <SavePromptDialog open={saveOpen} onOpenChange={setSaveOpen} prompt={prompt} kind={kind} modelId={model.id} params={params} />
    </div>
  );
}
