"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  Check,
  ChevronDown,
  Clapperboard,
  Columns2,
  Download,
  FolderInput,
  Hash,
  HelpCircle,
  Layers,
  LayoutGrid,
  Loader2,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AssetTile } from "@/components/assets/asset-tile";
import { CollectionDialog, CompareDialog, MoveDialog, TagDialog } from "@/components/assets/bulk-dialogs";
import { Lightbox } from "@/components/assets/lightbox";
import { selectionKeyAction, VerdictBadge } from "@/components/assets/selection-controls";
import { PageTitle } from "@/components/brand/page-title";
import { FinalizeDialog } from "@/components/studio/results-feed";
import { Button } from "@/components/ui/button";
import { Segmented, Select } from "@/components/ui/controls";
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, Tip } from "@/components/ui/menu";
import { EmptyState, Kbd } from "@/components/ui/misc";
import { downloadUrl, downloadZip, useAssetMutations, type AssetPatch } from "@/lib/client/assets";
import { useActiveGenerations } from "@/lib/client/generations";
import { MODELS } from "@/lib/models/registry";
import { SEARCH_HELP } from "@/lib/search/query";
import type { AssetListItem } from "@/lib/services/library";
import { COLOR_LABELS, FLAG_LABEL, type ColorLabel, type Flag } from "@/lib/types";
import { cn, fetchJson } from "@/lib/utils";

type Scope = "all" | "mine" | "fav" | "trash";
type Size = "s" | "m" | "l";

function useColumns(ref: React.RefObject<HTMLDivElement | null>, size: Size) {
  const [cols, setCols] = React.useState(4);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = size === "s" ? 170 : size === "m" ? 240 : 340;
    const update = () => setCols(Math.max(2, Math.round(el.clientWidth / target)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, size]);
  return cols;
}

/** 가장 짧은 열에 배치 (행 우선 순서를 최대한 유지) */
function masonry(items: AssetListItem[], cols: number) {
  const columns: { item: AssetListItem; index: number }[][] = Array.from({ length: cols }, () => []);
  const heights = new Array(cols).fill(0);
  items.forEach((item, index) => {
    const ratio = item.width && item.height ? item.height / item.width : 1;
    let c = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 0.01) c = i;
    columns[c].push({ item, index });
    heights[c] += ratio;
  });
  return columns;
}

export function AssetBrowser({
  projectId,
  collectionId,
  cutId,
  canEdit = true,
  title,
  label,
  accent,
  subtitle,
  actions,
  hideScope,
}: {
  projectId?: string;
  collectionId?: string;
  /** 컷 id 또는 "none"(컷 없는 클립) */
  cutId?: string;
  canEdit?: boolean;
  title?: React.ReactNode;
  /** 제목 위 모노 라벨·옆 세리프 한 줄 (페이지 제목으로 쓸 때) */
  label?: string;
  accent?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  hideScope?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { update } = useAssetMutations();

  const [input, setInput] = React.useState(sp.get("q") ?? "");
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [kind, setKind] = React.useState<"all" | "image" | "video">("all");
  const [scope, setScope] = React.useState<Scope>(sp.get("favorites") === "1" ? "fav" : sp.get("mine") === "1" ? "mine" : sp.get("trash") === "1" ? "trash" : "all");
  const [models, setModels] = React.useState<string[]>([]);
  const [minRating, setMinRating] = React.useState(0);
  const [flags, setFlags] = React.useState<(Flag | "none")[]>([]);
  const [colors, setColors] = React.useState<ColorLabel[]>([]);
  const [sort, setSort] = React.useState<"newest" | "oldest" | "rating" | "relevance">("newest");
  const [size, setSize] = React.useState<Size>("m");
  const [square, setSquare] = React.useState(false);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [anchor, setAnchor] = React.useState<number | null>(null);
  const [focus, setFocus] = React.useState<number>(-1);
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  const [dialog, setDialog] = React.useState<null | "tag" | "move" | "collection" | "compare">(null);
  const [finalizeId, setFinalizeId] = React.useState<string | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const cols = useColumns(gridRef, size);

  React.useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  // URL에 검색어 반영 (공유 가능한 링크)
  React.useEffect(() => {
    const params = new URLSearchParams(sp.toString());
    if (q) params.set("q", q);
    else params.delete("q");
    const next = `${pathname}${params.toString() ? `?${params}` : ""}`;
    if (next !== `${pathname}${sp.toString() ? `?${sp}` : ""}`) router.replace(next, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const params = React.useMemo(() => {
    const p = new URLSearchParams({ limit: "60", sort });
    if (q) p.set("q", q);
    if (projectId) p.set("projectId", projectId);
    if (collectionId) p.set("collectionId", collectionId);
    if (cutId) p.set("cutId", cutId);
    if (kind !== "all") p.set("kind", kind);
    if (scope === "mine") p.set("mine", "1");
    if (scope === "fav") p.set("favorites", "1");
    if (scope === "trash") p.set("trash", "1");
    if (models.length) p.set("models", models.join(","));
    if (minRating) p.set("minRating", String(minRating));
    if (flags.length) p.set("flags", flags.join(","));
    if (colors.length) p.set("colors", colors.join(","));
    return p.toString();
  }, [q, projectId, collectionId, cutId, kind, scope, models, minRating, flags, colors, sort]);

  const query = useInfiniteQuery({
    queryKey: ["assets", params],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchJson<{ items: AssetListItem[]; nextOffset: number | null }>(`/api/assets?${params}&offset=${pageParam}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const items = React.useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const columns = React.useMemo(() => masonry(items, cols), [items, cols]);

  // 새 생성물이 완료되면 목록 새로고침
  const { data: active = [] } = useActiveGenerations();
  const doneCount = active.filter((g) => g.status === "completed").length;
  React.useEffect(() => {
    if (doneCount) void qc.invalidateQueries({ queryKey: ["assets"] });
  }, [doneCount, qc]);

  // ?asset= 으로 들어오면 바로 열기
  const deepLink = sp.get("asset");
  const deepLinkQuery = useQuery({
    queryKey: ["asset", deepLink],
    queryFn: () => fetchJson<AssetListItem>(`/api/assets/${deepLink}`),
    enabled: !!deepLink,
  });
  const [deepOpen, setDeepOpen] = React.useState(!!deepLink);

  // 무한 스크롤
  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const selectedItems = items.filter((i) => selected.has(i.id));
  const targetIds = React.useCallback(() => (selected.size ? Array.from(selected) : focus >= 0 && items[focus] ? [items[focus].id] : []), [selected, focus, items]);

  const apply = React.useCallback(
    async (patch: AssetPatch, ids = targetIds()) => {
      if (!ids.length) return;
      // 낙관적 업데이트
      qc.setQueriesData<{ pages: { items: AssetListItem[]; nextOffset: number | null }[] }>({ queryKey: ["assets"] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((pg) => ({
                ...pg,
                items: pg.items.map((it) =>
                  ids.includes(it.id)
                    ? {
                        ...it,
                        ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
                        ...(patch.flag !== undefined ? { flag: patch.flag } : {}),
                        ...(patch.colorLabel !== undefined ? { colorLabel: patch.colorLabel } : {}),
                        ...(patch.favorite !== undefined ? { isFavorite: patch.favorite } : {}),
                      }
                    : it,
                ),
              })),
            }
          : data,
      );
      await update(ids, patch);
    },
    [qc, update, targetIds],
  );

  // 컷으로 옮기기 (프로젝트 안에서)
  const { data: cutOptions = [] } = useQuery({
    queryKey: ["cut-options", projectId],
    queryFn: () => fetchJson<{ items: { id: string; code: string; title: string | null }[] }>(`/api/projects/${projectId}/cuts?lite=1`).then((r) => r.items),
    enabled: !!projectId && canEdit,
    staleTime: 30_000,
  });
  async function moveToCut(target: string | null) {
    const ids = targetIds();
    if (!ids.length) return;
    try {
      await fetchJson("/api/assets", { method: "PATCH", body: JSON.stringify({ ids, patch: {}, cutId: target }) });
      const code = cutOptions.find((c) => c.id === target)?.code;
      toast.success(target ? `${ids.length}개를 ${code}(으)로 옮겼어요.` : `${ids.length}개를 컷에서 뺐어요.`);
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["cut-board"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function clickTile(index: number, e: React.MouseEvent) {
    const it = items[index];
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)];
      setSelected((s) => new Set([...s, ...items.slice(a, b + 1).map((x) => x.id)]));
      setFocus(index);
      return;
    }
    if (e.metaKey || e.ctrlKey || selected.size) {
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(it.id)) n.delete(it.id);
        else n.add(it.id);
        return n;
      });
      setAnchor(index);
      setFocus(index);
      return;
    }
    setFocus(index);
    setLightbox(index);
  }

  // 키보드
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lightbox !== null || dialog || deepOpen) return;
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      if (document.querySelector("[role=dialog]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(items.map((i) => i.id)));
        return;
      }
      if (e.key === "Escape") return setSelected(new Set());
      if (e.key === "ArrowRight") return (e.preventDefault(), setFocus((f) => Math.min(items.length - 1, f + 1)));
      if (e.key === "ArrowLeft") return (e.preventDefault(), setFocus((f) => Math.max(0, f - 1)));
      if (e.key === "ArrowDown") return (e.preventDefault(), setFocus((f) => Math.min(items.length - 1, f + cols)));
      if (e.key === "ArrowUp") return (e.preventDefault(), setFocus((f) => Math.max(0, f - cols)));
      if ((e.key === "Enter" || e.key === " ") && focus >= 0) return (e.preventDefault(), setLightbox(focus));
      if ((e.key === "Delete" || e.key === "Backspace") && canEdit && selected.size) {
        e.preventDefault();
        void apply({ deleted: scope !== "trash" }).then(() => {
          toast(scope === "trash" ? "복원했어요." : `${selected.size}개를 휴지통으로 옮겼어요.`);
          setSelected(new Set());
          void qc.invalidateQueries({ queryKey: ["assets"] });
        });
        return;
      }
      const act = selectionKeyAction(e);
      if (!act || !canEdit) return;
      const ids = targetIds();
      if (!ids.length) return;
      e.preventDefault();
      if ("rating" in act) void apply({ rating: act.rating }, ids);
      else if ("flag" in act) void apply({ flag: act.flag }, ids);
      else if ("colorLabel" in act) void apply({ colorLabel: act.colorLabel }, ids);
      else {
        const all = ids.every((id) => items.find((i) => i.id === id)?.isFavorite);
        void apply({ favorite: !all }, ids);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focus, cols, lightbox, dialog, deepOpen, apply, canEdit, selected, scope, qc, targetIds]);

  // 포커스된 타일이 보이도록 스크롤
  React.useEffect(() => {
    if (focus < 0 || !items[focus]) return;
    document.querySelector(`[data-asset-id="${items[focus].id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus, items]);

  const activeFilterCount = models.length + (minRating ? 1 : 0) + flags.length + colors.length + (kind !== "all" ? 1 : 0);
  const reset = () => {
    setModels([]);
    setMinRating(0);
    setFlags([]);
    setColors([]);
    setKind("all");
    setInput("");
  };

  return (
    <div className="flex flex-col gap-4">
      {title && label ? (
        <PageTitle label={label} title={title} accent={accent} subtitle={subtitle} actions={actions} />
      ) : (
        (title || actions) && (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              {title && <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>}
              {subtitle && <p className="mt-1 text-sm text-fg-3">{subtitle}</p>}
            </div>
            {actions}
          </div>
        )
      )}

      {/* 검색 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='검색: 네온 도시 · #인물 · @홍길동 · cut:C003 · is:ok · model:seedream · "정확한 구문"'
            className="h-11 w-full rounded-xl border border-line-2 bg-panel/80 pl-10 pr-24 text-[14px] outline-none transition placeholder:text-fg-4 focus:border-fg-3 focus:bg-panel-2"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {input && (
              <button onClick={() => setInput("")} className="rounded-md p-1 text-fg-4 hover:text-fg" aria-label="지우기">
                <X className="size-4" />
              </button>
            )}
            <SearchHelp onPick={(s) => setInput((v) => (v ? `${v} ${s}` : s))} />
          </div>
        </div>
        <SavedSearches current={input} onApply={setInput} />
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        {!hideScope && (
          <Segmented
            value={scope}
            onChange={(v) => {
              setScope(v);
              setSelected(new Set());
            }}
            options={[
              { value: "all", label: "전체" },
              { value: "mine", label: "내 파일" },
              { value: "fav", label: "즐겨찾기" },
              { value: "trash", label: "휴지통" },
            ]}
          />
        )}
        <Segmented value={kind} onChange={setKind} options={[{ value: "all", label: "모두" }, { value: "image", label: "이미지" }, { value: "video", label: "영상" }]} />

        <FilterMenu label="모델" count={models.length}>
          <MenuLabel>모델</MenuLabel>
          {MODELS.map((m) => (
            <MenuCheckboxItem
              key={m.id}
              checked={models.includes(m.id)}
              onCheckedChange={(c) => setModels((x) => (c ? [...x, m.id] : x.filter((y) => y !== m.id)))}
              onSelect={(e) => e.preventDefault()}
            >
              {m.name}
            </MenuCheckboxItem>
          ))}
        </FilterMenu>

        <FilterMenu label={minRating ? `★ ${minRating}+` : "별점"} count={minRating ? 1 : 0}>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <MenuItem key={n} onSelect={() => setMinRating(n)}>
              {n === 0 ? "전체" : (
                <span className="flex items-center gap-1">
                  {Array.from({ length: n }).map((_, i) => (
                    <Star key={i} className="size-3 fill-star text-star" />
                  ))}
                  {n < 5 && <span className="text-fg-4">이상</span>}
                </span>
              )}
              {minRating === n && <Check className="ml-auto" />}
            </MenuItem>
          ))}
        </FilterMenu>

        <FilterMenu label="판정" count={flags.length}>
          {([
            ["pick", "OK", <VerdictBadge key="p" flag="pick" />],
            ["keep", "KEEP (보류)", <VerdictBadge key="k" flag="keep" />],
            ["reject", "NG", <VerdictBadge key="r" flag="reject" />],
            ["none", "판정 안 함", <span key="n" className="w-8" />],
          ] as const).map(([v, label, icon]) => (
            <MenuCheckboxItem
              key={v}
              checked={flags.includes(v)}
              onCheckedChange={(c) => setFlags((x) => (c ? [...x, v] : x.filter((y) => y !== v)))}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="flex items-center gap-2">
                {icon}
                {label}
              </span>
            </MenuCheckboxItem>
          ))}
        </FilterMenu>

        <div className="flex items-center gap-1 rounded-[10px] border border-line bg-panel-2/60 px-2 py-1.5">
          {COLOR_LABELS.map((c) => (
            <Tip key={c.value} content={c.label}>
              <button
                type="button"
                onClick={() => setColors((x) => (x.includes(c.value) ? x.filter((y) => y !== c.value) : [...x, c.value]))}
                className={cn("size-4 rounded-full transition", colors.includes(c.value) ? "ring-2 ring-fg ring-offset-1 ring-offset-bg" : "opacity-60 hover:opacity-100")}
                style={{ background: c.hex }}
                aria-label={c.label}
              />
            </Tip>
          ))}
        </div>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw /> 초기화
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Select
            size="sm"
            value={sort}
            onValueChange={(v) => setSort(v as typeof sort)}
            options={[
              { value: "newest", label: "최신순" },
              { value: "oldest", label: "오래된순" },
              { value: "rating", label: "별점순" },
              { value: "relevance", label: "관련도순" },
            ]}
            className="w-[108px]"
          />
          <Tip content={square ? "원본 비율" : "정사각 그리드"}>
            <Button variant="secondary" size="icon-sm" onClick={() => setSquare((s) => !s)}>
              {square ? <Columns2 /> : <LayoutGrid />}
            </Button>
          </Tip>
          <Segmented value={size} onChange={setSize} size="sm" options={[{ value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }]} />
        </div>
      </div>

      {/* 결과 */}
      <div ref={gridRef} className="min-h-[50vh]">
        {query.isLoading ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols * 3 }).map((_, i) => (
              <div key={i} className="skeleton rounded-xl" style={{ aspectRatio: i % 3 === 0 ? "3/4" : i % 3 === 1 ? "1/1" : "4/3" }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={scope === "trash" ? <Trash2 /> : <Search />}
            title={q || activeFilterCount ? "조건에 맞는 파일이 없어요" : scope === "trash" ? "휴지통이 비어 있어요" : "아직 파일이 없어요"}
            description={q ? "다른 검색어나 동의어로 찾아보세요. 한국어·영어 모두 검색돼요." : "이미지·영상을 생성하거나 업로드하면 여기에 모여요."}
            action={activeFilterCount || q ? <Button variant="secondary" onClick={reset}>필터 초기화</Button> : undefined}
          />
        ) : (
          <div className="flex gap-3">
            {columns.map((col, ci) => (
              <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
                {col.map(({ item, index }) => (
                  <AssetTile
                    key={item.id}
                    a={item}
                    selected={selected.has(item.id)}
                    focused={focus === index}
                    selecting={selected.size > 0}
                    square={square}
                    showMeta={size !== "s"}
                    onClick={(e) => clickTile(index, e)}
                    onToggleSelect={(e) => {
                      e.stopPropagation();
                      if (e.shiftKey && anchor !== null) return clickTile(index, e);
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(item.id)) n.delete(item.id);
                        else n.add(item.id);
                        return n;
                      });
                      setAnchor(index);
                    }}
                    onFavorite={() => apply({ favorite: !item.isFavorite }, [item.id])}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
        <div ref={sentinel} className="flex justify-center py-8">
          {query.isFetchingNextPage && <Loader2 className="size-5 animate-spin text-fg-3" />}
        </div>
      </div>

      {/* 선택 바 */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
            className="glass fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl p-1.5 shadow-[var(--shadow-pop)] scrollbar-none"
          >
            <span className="flex items-center gap-2 whitespace-nowrap px-3 text-[13px] font-medium">
              <span className="flex size-5 items-center justify-center rounded-md bg-inv font-mono text-[10.5px] text-inv-fg">{selected.size}</span>
              선택됨
            </span>
            <span className="h-5 w-px bg-line-2" />
            {canEdit && scope !== "trash" && (
              <>
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="sm"><Star /> 별점</Button>
                  </MenuTrigger>
                  <MenuContent side="top">
                    {[5, 4, 3, 2, 1, 0].map((n) => (
                      <MenuItem key={n} onSelect={() => apply({ rating: n })} shortcut={String(n)}>
                        {n === 0 ? "별점 지우기" : "★".repeat(n)}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
                {(["pick", "keep", "reject"] as const).map((f) => (
                  <Tip key={f} content={FLAG_LABEL[f]} shortcut={f === "pick" ? "P" : f === "keep" ? "K" : "X"}>
                    <Button variant="ghost" size="sm" className="px-2 font-mono text-[11px] font-semibold" onClick={() => apply({ flag: f })}>
                      <VerdictBadge flag={f} className="shadow-none" />
                    </Button>
                  </Tip>
                ))}
                {cutOptions.length > 0 && (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Clapperboard /> 컷
                      </Button>
                    </MenuTrigger>
                    <MenuContent side="top" className="max-h-[320px] overflow-y-auto">
                      <MenuLabel>선택한 클립을 컷으로 (새 테이크 번호)</MenuLabel>
                      {cutOptions.map((c) => (
                        <MenuItem key={c.id} onSelect={() => void moveToCut(c.id)}>
                          <span className="font-mono text-[12px]">{c.code}</span>
                          {c.title && <span className="truncate text-fg-3">{c.title}</span>}
                        </MenuItem>
                      ))}
                      <MenuSeparator />
                      <MenuItem onSelect={() => void moveToCut(null)}>컷에서 빼기</MenuItem>
                    </MenuContent>
                  </Menu>
                )}
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="컬러 라벨"><span className="size-3.5 rounded-full bg-gradient-to-br from-[#ff4d4f] via-[#f5c542] to-[#4c8dff]" /></Button>
                  </MenuTrigger>
                  <MenuContent side="top">
                    {COLOR_LABELS.map((c) => (
                      <MenuItem key={c.value} onSelect={() => apply({ colorLabel: c.value })} shortcut={c.key || undefined}>
                        <span className="size-3 rounded-full" style={{ background: c.hex }} /> {c.label}
                      </MenuItem>
                    ))}
                    <MenuSeparator />
                    <MenuItem onSelect={() => apply({ colorLabel: null })}>라벨 지우기</MenuItem>
                  </MenuContent>
                </Menu>
                <Tip content="태그"><Button variant="ghost" size="icon-sm" onClick={() => setDialog("tag")}><Hash /></Button></Tip>
                <Tip content="컬렉션에 추가"><Button variant="ghost" size="icon-sm" onClick={() => setDialog("collection")}><Layers /></Button></Tip>
                <Tip content="프로젝트 이동"><Button variant="ghost" size="icon-sm" onClick={() => setDialog("move")}><FolderInput /></Button></Tip>
              </>
            )}
            <Tip content="비교 (2~4개)">
              <Button variant="ghost" size="icon-sm" disabled={selected.size < 2 || selected.size > 4} onClick={() => setDialog("compare")}>
                <Columns2 />
              </Button>
            </Tip>
            <Tip content="ZIP 다운로드 (자동 파일명)">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  toast("ZIP으로 묶는 중…");
                  if (selectedItems.length === 1) return downloadUrl(selectedItems[0].urls.download, selectedItems[0].filename);
                  void downloadZip(selectedItems.map((i) => ({ url: i.urls.download, filename: i.filename })), `zipup_${selectedItems.length}files.zip`);
                }}
              >
                <Download />
              </Button>
            </Tip>
            {canEdit && (
              <Tip content={scope === "trash" ? "복원" : "휴지통으로"}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={async () => {
                    await apply({ deleted: scope !== "trash" });
                    toast(scope === "trash" ? "복원했어요." : `${selected.size}개를 휴지통으로 옮겼어요.`, {
                      action: scope !== "trash" ? { label: "되돌리기", onClick: () => apply({ deleted: false }, Array.from(selected)) } : undefined,
                    });
                    setSelected(new Set());
                    void qc.invalidateQueries({ queryKey: ["assets"] });
                  }}
                >
                  {scope === "trash" ? <Undo2 /> : <Trash2 />}
                </Button>
              </Tip>
            )}
            {scope === "trash" && (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (!confirm(`${selected.size}개 파일을 영구 삭제할까요? 되돌릴 수 없어요.`)) return;
                  try {
                    await fetchJson("/api/assets", { method: "DELETE", body: JSON.stringify({ ids: Array.from(selected) }) });
                    toast("영구 삭제했어요.");
                    setSelected(new Set());
                    void qc.invalidateQueries({ queryKey: ["assets"] });
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                영구 삭제
              </Button>
            )}
            <span className="h-5 w-px bg-line-2" />
            <Tip content="선택 해제" shortcut="Esc">
              <Button variant="ghost" size="icon-sm" onClick={() => setSelected(new Set())}>
                <X />
              </Button>
            </Tip>
          </motion.div>
        )}
      </AnimatePresence>

      {selected.size === 0 && items.length > 0 && (
        <p className="hidden items-center justify-center gap-2 pb-2 text-[11px] text-fg-4 lg:flex">
          <Kbd>⌘</Kbd>/<Kbd>Shift</Kbd>+클릭 다중 선택 · <Kbd>1</Kbd>-<Kbd>5</Kbd> 별점 · <Kbd>P</Kbd> 픽 · <Kbd>X</Kbd> 탈락 · <Kbd>6</Kbd>-<Kbd>9</Kbd> 색 · <Kbd>F</Kbd> 즐겨찾기 · 방향키 이동
        </p>
      )}

      {lightbox !== null && (
        <Lightbox
          items={items}
          index={lightbox}
          onIndexChange={(i) => {
            setLightbox(i);
            setFocus(i);
            if (i >= items.length - 3 && query.hasNextPage) void query.fetchNextPage();
          }}
          onClose={() => {
            setLightbox(null);
            void qc.invalidateQueries({ queryKey: ["assets"] });
          }}
          onMoveProject={(ids) => {
            setSelected(new Set(ids));
            setDialog("move");
          }}
          onFinalize={(id) => setFinalizeId(id)}
        />
      )}
      {deepOpen && deepLinkQuery.data && (
        <Lightbox
          items={[deepLinkQuery.data]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => {
            setDeepOpen(false);
            const p = new URLSearchParams(sp.toString());
            p.delete("asset");
            router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
          }}
          onFinalize={(id) => setFinalizeId(id)}
        />
      )}

      <TagDialog
        open={dialog === "tag"}
        onOpenChange={(o) => !o && setDialog(null)}
        count={selected.size}
        onApply={async (add, remove) => {
          await apply({ addTags: add.length ? add : undefined, removeTags: remove.length ? remove : undefined });
          toast("태그를 적용했어요.");
          void qc.invalidateQueries({ queryKey: ["assets"] });
        }}
      />
      <MoveDialog
        open={dialog === "move"}
        onOpenChange={(o) => !o && setDialog(null)}
        count={selected.size}
        onMove={async (pid) => {
          await apply({ projectId: pid });
          toast("프로젝트를 옮겼어요.");
          setSelected(new Set());
          void qc.invalidateQueries({ queryKey: ["assets"] });
        }}
      />
      <CollectionDialog open={dialog === "collection"} onOpenChange={(o) => !o && setDialog(null)} assetIds={Array.from(selected)} defaultProjectId={projectId} />
      <CompareDialog open={dialog === "compare"} onOpenChange={(o) => !o && setDialog(null)} items={selectedItems} />
      <FinalizeDialog generationId={finalizeId} onOpenChange={(o) => !o && setFinalizeId(null)} generations={[]} status={{}} />
    </div>
  );
}

function FilterMenu({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-medium transition",
            count ? "border-fg/40 bg-panel-3 text-fg" : "border-line bg-panel-2/60 text-fg-3 hover:text-fg",
          )}
        >
          {label}
          {count > 0 && <span className="rounded bg-inv px-1 font-mono text-[10px] text-inv-fg">{count}</span>}
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="max-h-[60vh] overflow-y-auto">
        {children}
      </MenuContent>
    </Menu>
  );
}

function SearchHelp({ onPick }: { onPick: (s: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="rounded-md p-1 text-fg-4 hover:text-fg" aria-label="검색 도움말">
          <HelpCircle className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px]">
        <p className="mb-2 text-[13px] font-semibold">고급 검색</p>
        <div className="flex flex-col">
          {SEARCH_HELP.map((h) => (
            <button
              key={h.syntax}
              onClick={() => onPick(h.syntax.split(" ")[0])}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-panel-2"
            >
              <code className="font-mono text-[12px] text-accent">{h.syntax}</code>
              <span className="text-right text-[11.5px] text-fg-3">{h.desc}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SavedSearches({ current, onApply }: { current: string; onApply: (q: string) => void }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => fetchJson<{ items: { id: string; name: string; query: string }[] }>("/api/saved-searches").then((r) => r.items),
  });
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" className="h-11 rounded-xl">
          <Bookmark /> 저장된 검색
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-[280px]">
        {data.length === 0 && <p className="px-2 py-3 text-xs text-fg-4">자주 쓰는 검색을 저장해 두세요.</p>}
        {data.map((s) => (
          <MenuItem key={s.id} onSelect={() => onApply(s.query)}>
            <Bookmark className="text-fg-4" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{s.name}</span>
              <span className="truncate font-mono text-[10.5px] text-fg-4">{s.query}</span>
            </span>
            <button
              className="ml-auto rounded p-0.5 text-fg-4 hover:text-danger"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await fetchJson(`/api/saved-searches?id=${s.id}`, { method: "DELETE" });
                void qc.invalidateQueries({ queryKey: ["saved-searches"] });
              }}
              aria-label="삭제"
            >
              <X className="size-3" />
            </button>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          disabled={!current.trim()}
          onSelect={async () => {
            const name = prompt("검색 이름", current.slice(0, 30));
            if (!name) return;
            await fetchJson("/api/saved-searches", { method: "POST", body: JSON.stringify({ name, query: current }) });
            void qc.invalidateQueries({ queryKey: ["saved-searches"] });
            toast("검색을 저장했어요.");
          }}
        >
          <Bookmark /> 현재 검색 저장
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

