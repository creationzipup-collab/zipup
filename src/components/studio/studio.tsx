"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { BookText, FolderKanban, Languages, Megaphone, Minus, MonitorUp, Plus, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Lightbox, type LightboxItem } from "@/components/assets/lightbox";
import { BilingualPanel } from "@/components/prompt-desk/bilingual-panel";
import { type Baseline, DeskTabs, type DeskTab, DiffPanel, DocChip, SettingsCard } from "@/components/prompt-desk/desk-panels";
import { type EditorMark, PromptEditor } from "@/components/prompt-desk/prompt-editor";
import { type DeskDoc, SaveVersionDialog, VersionList } from "@/components/prompt-desk/versions";
import { PromptLibraryDialog } from "@/components/prompts/prompt-dialogs";
import { useShell } from "@/components/shell/app-shell";
import { ModelPicker, ProviderTag, type ModelStatus } from "@/components/studio/model-picker";
import { ParamControls } from "@/components/studio/param-controls";
import { EMPTY_INPUTS, type RefAsset, ReferenceSlots, type StudioInputs } from "@/components/studio/reference-slots";
import { FinalizeDialog, ResultsFeed } from "@/components/studio/results-feed";
import { Button } from "@/components/ui/button";
import { Segmented, Select } from "@/components/ui/controls";
import { Tip } from "@/components/ui/menu";
import {
  createGenerationRequest,
  isActive,
  useActiveGenerations,
  usePushGenerations,
  type GenerationDTO,
} from "@/lib/client/generations";
import { convertPromptRequest, type PromptDocDTO, type Suggestion, usePrimeTranslation, useTranslation } from "@/lib/client/prompt-tools";
import { useDualMonitor } from "@/lib/client/studio-channel";
import { useResultsView } from "@/lib/client/use-results-view";
import { defaultParams, IMAGE_MODELS, sanitizeParams, VIDEO_MODELS } from "@/lib/models/registry";
import type { ModelDef } from "@/lib/models/types";
import { MentionPanel, type MentionRef } from "@/components/prompt-desk/mention-panel";
import { matchCase } from "@/lib/client/lexicon";
import {
  findMentions,
  linkMentions,
  MENTION_STYLE_LABEL,
  mentionIssues,
  type MentionStyle,
  normalizeMentions,
  orderByMentions,
  renameGroup,
} from "@/lib/prompt/mentions";
import { replaceSegment } from "@/lib/prompt/align";
import { diffStats, diffWords } from "@/lib/prompt/diff";
import type { EditableProject, StudioPrefill } from "@/lib/services/studio";
import { cn, fetchJson, usd } from "@/lib/utils";

const INSPIRATION: Record<"image" | "video", string[]> = {
  image: [
    "A woman in a red silk dress walking through a neon-lit Seoul alley at night, wet asphalt reflections, light rain, cinematic 35mm film grain",
    "Studio product shot of a transparent glass perfume bottle, soft diffused lighting, pastel gradient background, minimal composition, crisp reflections",
    "K-pop idol concept photo, chrome accessories and techwear outfit, high-fashion editorial, strong backlight, shallow depth of field",
    "Cute 3D mascot character turnaround sheet, front, side and back views, white background, consistent proportions, soft studio lighting",
    "Poster design with the large bold headline \"ZIPUP SUMMER\", ocean and sun, Y2K graphic style, grainy texture",
  ],
  video: [
    "Tracking shot following a motorcycle racing through a rainy city at night, neon reflections, slow motion, cinematic",
    "An idol spins and dances on stage under colored spotlights while the camera slowly orbits around her, haze in the air",
    "A product slowly rotates in mid-air as a streak of light sweeps across its surface, black background, commercial look",
    "Drone shot flying over misty mountain ridges at dawn as the sun rises, golden light, epic scale",
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

  // 프롬프트 데스크
  const [doc, setDoc] = React.useState<DeskDoc | null>(prefill.doc ?? null);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [tab, setTab] = React.useState<DeskTab>("ko");
  const [pasteBase, setPasteBase] = React.useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = React.useState<string | null>(null);
  const [compare, setCompare] = React.useState<Baseline | null>(null);
  const [converting, setConverting] = React.useState<"en" | "zh" | null>(null);
  const [resultsView, setResultsView] = useResultsView(`studio-${kind}`, "batches");
  const promptRef = React.useRef<HTMLTextAreaElement>(null);
  // 강조 구간은 그 구간을 만든 글과 함께 기억 (글이 바뀌면 자동으로 사라짐)
  const [highlightState, setHighlightState] = React.useState<{ start: number; end: number; text: string } | null>(null);
  const highlight = highlightState && highlightState.text === prompt ? highlightState : null;
  const setHighlight = React.useCallback(
    (r: { start: number; end: number } | null, forText?: string) => setHighlightState(r ? { ...r, text: forText ?? promptRef.current?.value ?? "" } : null),
    [],
  );
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

  /* ------------------------------- 비용·검증 ------------------------------- */

  const st = status[model.id];
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
          provider: (params.draft === true ? st?.draftProvider : st?.provider) ?? undefined,
        },
        st?.priceOverrides ?? {},
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
  const disabledReason = !st?.provider ? "API 키가 설정되지 않은 모델이에요" : st.enabled === false ? "관리자가 비활성화한 모델이에요" : overBudget ? "예산이 부족해요" : validation;

  /* ------------------------------ 결과·듀얼 모니터 ------------------------------ */

  const addReference = React.useCallback(
    (item: RefAsset) => {
      if (item.kind === "image" && slots.images) setInputs((v) => ({ ...v, images: [...v.images.filter((x) => x.id !== item.id), item].slice(0, slots.images!.max) }));
      else if (item.kind === "image" && slots.startFrame) setInputs((v) => ({ ...v, startFrame: item }));
      else if (item.kind === "video" && slots.videos) setInputs((v) => ({ ...v, videos: [item, ...v.videos].slice(0, slots.videos!.max) }));
      else return toast.error("이 모델에는 넣을 수 없는 파일이에요.");
      toast("레퍼런스로 추가했어요.");
    },
    [slots.images, slots.startFrame, slots.videos],
  );

  function reuse(g: GenerationDTO) {
    if (g.modelId !== model.id && models.some((m) => m.id === g.modelId)) setModelId(g.modelId);
    setParamsByModel((p) => ({ ...p, [g.modelId]: g.params }));
    if (g.prompt !== prompt && prompt.trim()) setPasteBase(prompt);
    setPrompt(g.prompt);
    promptRef.current?.focus();
    toast("프롬프트와 설정을 불러왔어요.");
  }

  const dual = useDualMonitor(kind, {
    onReuse: reuse,
    onReference: addReference,
    onFocus: () => {
      window.focus();
      promptRef.current?.focus();
    },
  });

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
      dual.post({ type: "submitted", kind, generations: res.generations });
      setLastSubmitted(prompt);
      router.refresh();
      toast.success(`${model.shortName} 생성을 시작했어요`, { description: `${res.generations.length}건 · 예상 ${usd(estimateMicros)}${dual.active ? " · 결과 창에서 확인" : ""}` });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ⌘/Ctrl + Enter 생성, ⌘/Ctrl + S 저장
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      } else if (e.key.toLowerCase() === "s" && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        if (prompt.trim()) setSaveOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const history = useInfiniteQuery({
    queryKey: ["generations", "history", kind],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      fetchJson<{ items: GenerationDTO[] }>(`/api/generations?kind=${kind}&limit=24${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`).then((r) => r.items),
    getNextPageParam: (last) => (last.length >= 24 ? new Date(new Date(last[last.length - 1].createdAt).getTime() - 1).toISOString() : undefined),
    enabled: !dual.active,
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

  /* ------------------------------ 번역·추천·버전 ------------------------------ */

  const tr = useTranslation(prompt, true);
  const primeTranslation = usePrimeTranslation();

  function applySuggestion(index: number, s: Suggestion) {
    const data = tr.data;
    if (!data || tr.stale) return;
    const before = prompt;
    const out = replaceSegment(prompt, data.segments, index, s.text, s.ko);
    primeTranslation(out.text, { ...data, segments: out.segments, cached: true });
    setPrompt(out.text);
    setHighlight({ start: out.segments[index].start, end: out.segments[index].end }, out.text);
    toast.success("영어 프롬프트에 적용했어요", { description: s.text, action: { label: "되돌리기", onClick: () => setPrompt(before) } });
  }

  /** 단어 카드에서 고른 표현으로 바꾸기 */
  function replaceRange(start: number, end: number, text: string) {
    const before = prompt;
    const original = before.slice(start, end);
    const next = matchCase(original, text);
    const out = before.slice(0, start) + next + before.slice(end);
    setPrompt(out);
    setHighlight({ start, end: start + next.length }, out);
    toast.success(`${original} → ${next}`, { action: { label: "되돌리기", onClick: () => setPrompt(before) } });
  }

  /* ------------------------------ @언급 정리 ------------------------------ */

  const mentionStyle: MentionStyle | null = slots.images || slots.videos ? (model.mentionStyle ?? "natural") : null;
  const mentionRefs: MentionRef[] = React.useMemo(
    () => [
      ...inputs.images.map((a, i) => ({ id: a.id, kind: "image" as const, order: i + 1, filename: a.filename, thumb: a.urls.thumb, src: a.urls.src })),
      ...inputs.videos.map((a, i) => ({ id: a.id, kind: "video" as const, order: i + 1, filename: a.filename, thumb: a.urls.thumb, src: a.urls.src })),
    ],
    [inputs.images, inputs.videos],
  );
  const [manualLinks, setManualLinks] = React.useState<Record<string, string | null>>({});
  const mentions = React.useMemo(() => findMentions(prompt), [prompt]);
  const mentionGroups = React.useMemo(() => linkMentions(mentions, mentionRefs, manualLinks), [mentions, mentionRefs, manualLinks]);
  const mentionFix = React.useMemo(
    () => (mentionStyle ? normalizeMentions(prompt, mentionGroups, mentionRefs, mentionStyle) : { text: prompt, changed: 0 }),
    [prompt, mentionGroups, mentionRefs, mentionStyle],
  );
  const mentionOrdered = React.useMemo(() => {
    const imgs = orderByMentions(inputs.images, mentionGroups, mentions);
    const vids = orderByMentions(inputs.videos, mentionGroups, mentions);
    const same = (a: { id: string }[], b: { id: string }[]) => a.every((x, i) => x.id === b[i]?.id);
    return same(imgs, inputs.images) && same(vids, inputs.videos) ? null : { images: imgs, videos: vids };
  }, [inputs.images, inputs.videos, mentionGroups, mentions]);
  const editorMarks: EditorMark[] = React.useMemo(() => {
    const byId = new Map(mentionRefs.map((r) => [r.id, r]));
    return mentionGroups.flatMap((g) => {
      const ref = g.refId ? byId.get(g.refId) : undefined;
      const tone: EditorMark["tone"] = g.status === "linked" ? "ok" : g.status === "guessed" ? "info" : g.status === "missing" ? "error" : "warn";
      return g.mentions
        .filter((m) => m.explicit || ref)
        .map((m) => ({
          start: m.start,
          end: m.end,
          tone,
          title: ref ? `${m.raw} → ${ref.kind === "video" ? "영상" : "이미지"} ${ref.order}` : m.raw,
          subtitle: ref ? ref.filename : g.reason,
          thumb: ref?.thumb,
        }));
    });
  }, [mentionGroups, mentionRefs]);

  function normalizeAllMentions() {
    if (!mentionStyle || !mentionFix.changed) return;
    const before = prompt;
    setPrompt(mentionFix.text);
    setManualLinks({});
    toast.success(`언급 ${mentionFix.changed}곳을 ${MENTION_STYLE_LABEL[mentionStyle]} 형식으로 정리했어요`, { action: { label: "되돌리기", onClick: () => setPrompt(before) } });
  }

  function reorderByMentions() {
    if (!mentionOrdered || !mentionStyle) return;
    const before = { prompt, inputs };
    const nextInputs = { ...inputs, images: mentionOrdered.images, videos: mentionOrdered.videos };
    // 레퍼런스 순서가 바뀌면 번호도 바뀌므로 언급도 새 번호로 다시 씀
    const nextRefs: MentionRef[] = [
      ...nextInputs.images.map((a, i) => ({ id: a.id, kind: "image" as const, order: i + 1, filename: a.filename, thumb: a.urls.thumb })),
      ...nextInputs.videos.map((a, i) => ({ id: a.id, kind: "video" as const, order: i + 1, filename: a.filename, thumb: a.urls.thumb })),
    ];
    const out = normalizeMentions(prompt, mentionGroups, nextRefs, mentionStyle);
    setInputs(nextInputs);
    setPrompt(out.text);
    setManualLinks({});
    toast.success("언급한 순서대로 레퍼런스를 정렬했어요", {
      action: {
        label: "되돌리기",
        onClick: () => {
          setInputs(before.inputs);
          setPrompt(before.prompt);
        },
      },
    });
  }

  /** 커서 자리에 글 넣기 (앞뒤 띄어쓰기 맞춤) */
  function insertAtCursor(text: string) {
    const el = promptRef.current;
    const at = el ? el.selectionStart : prompt.length;
    const end = el ? el.selectionEnd : prompt.length;
    const before = prompt.slice(0, at);
    const after = prompt.slice(end);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const trail = after && !/^[\s,.;:!?]/.test(after) ? " " : "";
    const next = `${before}${lead}${text}${trail}${after}`;
    setPrompt(next);
    const caret = before.length + lead.length + text.length;
    setHighlight({ start: before.length + lead.length, end: caret }, next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  async function convert(target: "en" | "zh") {
    if (!prompt.trim()) return;
    setConverting(target);
    try {
      const r = await convertPromptRequest(prompt, target);
      setPasteBase(prompt);
      setPrompt(r.text);
      setTab("ko");
      toast.success(target === "en" ? "영어 프롬프트로 바꿨어요" : "중국어 프롬프트로 바꿨어요", {
        description: "한국어 대조로 뜻이 맞는지 확인해 보세요.",
        action: { label: "되돌리기", onClick: () => setPrompt(prompt) },
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConverting(null);
    }
  }

  const baselines: Baseline[] = [];
  if (doc) baselines.push({ key: "saved", label: `저장된 v${doc.baseVersion ?? doc.version}`, text: doc.baseText });
  if (pasteBase !== null) baselines.push({ key: "paste", label: "이전 내용", text: pasteBase });
  if (lastSubmitted !== null) baselines.push({ key: "submitted", label: "마지막 생성", text: lastSubmitted });
  if (compare && !baselines.some((b) => b.key === compare.key)) baselines.push(compare);
  const activeBaseline = (compare && baselines.find((b) => b.key === compare.key)) || baselines[0] || null;
  const diffCount = React.useMemo(() => {
    if (!activeBaseline) return 0;
    const s = diffStats(diffWords(activeBaseline.text, prompt));
    return s.added + s.removed;
  }, [activeBaseline, prompt]);

  async function linkDoc(id: string) {
    try {
      const r = await fetchJson<{ doc: PromptDocDTO; prompt: string }>(`/api/prompts/${id}`);
      setDoc({ id: r.doc.id, title: r.doc.title, version: r.doc.latestVersion, visibility: r.doc.visibility, canAddVersion: r.doc.canAddVersion, baseText: r.prompt });
    } catch {
      // 연결 실패해도 프롬프트 사용은 가능
    }
  }

  /* ---------------------------------- 화면 ---------------------------------- */

  const settingsSummary = [
    model.params
      .filter((p) => !p.advanced && !p.hidden?.(params) && p.type === "select")
      .map((p) => String(params[p.key] ?? ""))
      .filter(Boolean)
      .slice(0, 3)
      .join(" · "),
    typeof params.duration === "number" && !model.params.find((p) => p.key === "duration")?.hidden?.(params) ? `${params.duration}초` : null,
    params.draft === true ? "드래프트" : null,
    inputs.images.length + inputs.videos.length + (inputs.startFrame ? 1 : 0) + (inputs.endFrame ? 1 : 0) > 0
      ? `레퍼런스 ${inputs.images.length + inputs.videos.length + (inputs.startFrame ? 1 : 0) + (inputs.endFrame ? 1 : 0)}`
      : null,
    projects.find((p) => p.id === projectId)?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  const tabs = (
    <DeskTabs
      tab={tab}
      onTab={setTab}
      translating={tr.loading}
      diffCount={diffCount}
      versionLabel={doc ? `v${doc.version}` : null}
      mentions={mentionStyle || mentionGroups.length ? { count: mentionGroups.length, issues: mentionIssues(mentionGroups) } : null}
    >
      {tab === "ko" && (
        <BilingualPanel
          text={prompt}
          lang={tr.lang}
          segments={tr.data?.segments ?? []}
          loading={tr.loading}
          error={tr.error}
          mock={tr.data?.mock}
          stale={tr.stale}
          readOnly={tr.stale}
          engine={tr.data?.engine}
          onApply={applySuggestion}
          onReplaceRange={replaceRange}
          onFocusRange={(start, end) => setHighlight({ start, end }, prompt)}
          onRetry={() => void tr.refetch()}
          onConvert={convert}
          converting={converting}
        />
      )}
      {tab === "mentions" && (
        <MentionPanel
          groups={mentionGroups}
          refs={mentionRefs}
          style={mentionStyle}
          modelName={model.name}
          pendingChanges={mentionFix.changed}
          canReorder={!!mentionOrdered}
          onNormalize={normalizeAllMentions}
          onRelink={(key, refId) => setManualLinks((m) => ({ ...m, [key]: refId }))}
          onRename={(key, to) => {
            const g = mentionGroups.find((x) => x.key === key);
            if (!g) return;
            const before = prompt;
            setPrompt(renameGroup(prompt, g, to));
            toast.success(`${g.label} → ${to} (${g.mentions.length}곳)`, { action: { label: "되돌리기", onClick: () => setPrompt(before) } });
          }}
          onInsert={insertAtCursor}
          onReorder={reorderByMentions}
          onFocus={(start, end) => {
            setHighlight({ start, end }, prompt);
            promptRef.current?.focus();
            promptRef.current?.setSelectionRange(start, end);
          }}
        />
      )}
      {tab === "diff" && <DiffPanel baselines={baselines} active={activeBaseline} onPick={setCompare} current={prompt} />}
      {tab === "versions" && (
        <VersionList
          doc={doc}
          currentText={prompt}
          compareVersion={compare?.key.startsWith("v") ? Number(compare.key.slice(1)) : null}
          onCompare={(v) => {
            setCompare({ key: `v${v.version}`, label: `v${v.version}`, text: v.prompt });
            setTab("diff");
          }}
          onLoad={(v) => {
            const before = prompt;
            setPrompt(v.prompt);
            if (doc) setDoc({ ...doc, baseText: v.prompt, baseVersion: v.version });
            if (v.modelId && v.params && models.some((m) => m.id === v.modelId)) {
              setModelId(v.modelId);
              setParamsByModel((p) => ({ ...p, [v.modelId!]: v.params! }));
            }
            toast(`v${v.version}을 불러왔어요.`, { action: { label: "되돌리기", onClick: () => setPrompt(before) } });
          }}
        />
      )}
    </DeskTabs>
  );

  return (
    <div className={cn("grid min-h-[calc(100dvh-56px)]", !dual.active && "lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]")}>
      {/* ------------------------------ 프롬프트 데스크 ------------------------------ */}
      <section className="flex flex-col border-line lg:sticky lg:top-14 lg:h-[calc(100dvh-56px)] lg:border-r" data-hotkeys-scope>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className={cn("mx-auto flex w-full flex-col gap-4 p-4 sm:p-6", dual.active && "max-w-[1600px] xl:grid xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] xl:items-start xl:gap-6")}>
            <div className="flex min-w-0 flex-col gap-4">
              {/* 머리글 */}
              <div className="flex items-center gap-2">
                <span className="eyebrow">{kind === "image" ? "Image Studio" : "Video Studio"}</span>
                <ProviderTag status={st} />
                <div className="ml-auto flex items-center gap-1">
                  <Tip content="프롬프트 라이브러리">
                    <Button variant="ghost" size="sm" onClick={() => setLibraryOpen(true)}>
                      <BookText /> <span className="hidden sm:inline">라이브러리</span>
                    </Button>
                  </Tip>
                  <Tip content={dual.active ? "결과 창이 열려 있어요 (다시 누르면 앞으로)" : "결과를 다른 모니터에 띄우기"}>
                    <Button
                      variant={dual.active ? "secondary" : "ghost"}
                      size="sm"
                      onClick={async () => {
                        const ok = await dual.open();
                        if (!ok) toast.error("팝업이 차단됐어요. 주소창의 팝업 허용을 눌러 주세요.");
                      }}
                      className={cn(dual.active && "border-accent/40 text-accent")}
                    >
                      <MonitorUp /> <span className="hidden sm:inline">{dual.active ? "듀얼 모니터 켜짐" : "듀얼 모니터"}</span>
                    </Button>
                  </Tip>
                </div>
              </div>

              <ModelPicker models={models} value={model} status={status} onChange={(m) => setModelId(m.id)} />
              {st?.notes && (
                <p className="-mt-1 flex gap-2 rounded-xl border border-info/25 bg-info/8 px-3 py-2 text-[12px] leading-relaxed text-fg-2">
                  <Megaphone className="mt-0.5 size-3.5 shrink-0 text-info" />
                  {st.notes}
                </p>
              )}

              {/* 주인공: 프롬프트 */}
              <PromptEditor
                ref={promptRef}
                value={prompt}
                onChange={setPrompt}
                lang={tr.lang}
                kind={kind}
                highlight={highlight}
                marks={editorMarks}
                onReplace={replaceRange}
                onPasteReplace={(before) => {
                  setPasteBase(before);
                  setCompare({ key: "paste", label: "이전 내용", text: before });
                  setTab("diff");
                  toast("새 버전을 붙여넣었어요 — 달라진 부분을 표시했어요.");
                }}
                header={<DocChip doc={doc} text={prompt} onSave={() => setSaveOpen(true)} onVersions={() => setTab("versions")} />}
                footer={
                  <div className="flex flex-wrap items-center gap-1">
                    <Tip content="예시 프롬프트">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          const list = INSPIRATION[kind];
                          const next = list[Math.floor(Math.random() * list.length)];
                          if (prompt.trim()) setPasteBase(prompt);
                          setPrompt(next);
                        }}
                      >
                        <Wand2 /> 영감
                      </Button>
                    </Tip>
                    {tr.lang !== "empty" && tr.lang !== "en" && (
                      <Button variant="ghost" size="xs" loading={converting === "en"} onClick={() => convert("en")}>
                        {converting !== "en" && <Languages />} 영어로
                      </Button>
                    )}
                    {tr.lang !== "empty" && tr.lang !== "zh" && (
                      <Button variant="ghost" size="xs" loading={converting === "zh"} onClick={() => convert("zh")}>
                        {converting !== "zh" && <Languages />} 中文으로
                      </Button>
                    )}
                  </div>
                }
              />

              {!dual.active && tabs}

              <SettingsCard summary={settingsSummary}>
                <ReferenceSlots slots={slots} value={inputs} onChange={setInputs} projectId={projectId} mentionStyle={mentionStyle} onInsertMention={insertAtCursor} />
                <ParamControls model={model} params={params} onChange={(next) => setParamsByModel((p) => ({ ...p, [model.id]: next }))} />
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
              </SettingsCard>
            </div>

            {dual.active && <aside className="min-w-0 xl:sticky xl:top-0">{tabs}</aside>}
          </div>
        </div>

        {/* 생성 바 */}
        <div className="sticky bottom-0 z-20 border-t border-line bg-bg-2/85 px-4 py-3 backdrop-blur-xl sm:px-6 lg:static">
          <div className={cn("mx-auto flex items-center gap-2", dual.active && "max-w-[1600px]")}>
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
                  className={cn("glow-ring h-11 w-full justify-between rounded-[13px] px-4", !disabledReason && "shadow-[0_0_36px_-8px_var(--accent)]")}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles /> {params.draft ? "드래프트 생성 (480p)" : "생성하기"}
                  </span>
                  <span className="font-mono text-[12.5px] opacity-70">{usd(estimateMicros)}</span>
                </Button>
              </span>
            </Tip>
          </div>
          <div className={cn("mx-auto mt-1.5 flex items-center justify-between text-[11px] text-fg-4", dual.active && "max-w-[1600px]")}>
            <span>{left !== null ? <span className={cn(overBudget && "text-danger")}>남은 예산 {usd(Math.max(0, left))}</span> : "예산 한도 없음"}</span>
            <span>{pendingAhead > 0 ? `대기열 ${pendingAhead}건` : "예상 비용 · 실패 시 환불"}</span>
          </div>
        </div>
      </section>

      {/* ------------------------------ 결과 피드 ------------------------------ */}
      {!dual.active && (
        <section className="min-w-0 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="eyebrow">Results</span>
            {active.filter((g) => g.kind === kind && isActive(g)).length > 0 && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-accent" /> 생성 중 {active.filter((g) => g.kind === kind && isActive(g)).length}건
              </span>
            )}
            <Segmented
              size="xs"
              value={resultsView}
              onChange={setResultsView}
              className="ml-auto"
              options={[
                { value: "batches", label: "요청별" },
                { value: "gallery", label: "갤러리" },
              ]}
            />
          </div>
          <ResultsFeed
            view={resultsView}
            kind={kind}
            generations={merged}
            loading={history.isLoading}
            hasMore={!!history.hasNextPage}
            loadingMore={history.isFetchingNextPage}
            onLoadMore={() => history.fetchNextPage()}
            onOpen={(items, index) => setLightbox({ items, index })}
            onReuse={reuse}
            onFinalize={(id) => setFinalizeId(id)}
            onUseAsReference={addReference}
          />
        </section>
      )}

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
          if (prompt.trim() && p.prompt !== prompt) setPasteBase(prompt);
          setPrompt(p.prompt);
          if (p.modelId && models.some((m) => m.id === p.modelId)) setModelId(p.modelId);
          if (p.modelId && p.params) setParamsByModel((x) => ({ ...x, [p.modelId!]: p.params! }));
          void linkDoc(p.id);
        }}
      />
      <SaveVersionDialog open={saveOpen} onOpenChange={setSaveOpen} doc={doc} text={prompt} kind={kind} modelId={model.id} params={params} onSaved={setDoc} />
    </div>
  );
}
