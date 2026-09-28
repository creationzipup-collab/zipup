"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Clapperboard, Download, GripVertical, ImagePlus, MoreHorizontal, Pin, Plus, Trash2, UserRound } from "lucide-react";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { AssetBrowser } from "@/components/assets/asset-browser";
import { MediaThumb } from "@/components/assets/media";
import { VerdictBadge, VERDICT_STYLE } from "@/components/assets/selection-controls";
import { RollingNumber } from "@/components/brand/motion";
import { useDirectory } from "@/components/projects/project-dialogs";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Avatar, TimeAgo } from "@/components/ui/misc";
import { downloadZip } from "@/lib/client/assets";
import { nextCutCodes } from "@/lib/cuts";
import type { CutBoard, CutDTO, CutTake } from "@/lib/services/cuts";
import { CUT_STATUS_LABEL, type CutStatus, type Flag } from "@/lib/types";
import { cn, fetchJson } from "@/lib/utils";

const STATUS_ORDER: CutStatus[] = ["todo", "wip", "review", "done"];
const STATUS_DOT: Record<CutStatus, string> = {
  todo: "bg-fg-4",
  wip: "bg-accent",
  review: "bg-info",
  done: "bg-success",
};

export function useCutBoard(projectId: string) {
  return useQuery({
    queryKey: ["cut-board", projectId],
    queryFn: () => fetchJson<CutBoard>(`/api/projects/${projectId}/cuts`),
    // 누가 생성 중인지 보이도록 가끔 새로고침 (보고 있을 때만)
    refetchInterval: (q) => (q.state.data?.cuts.some((c) => c.active.length) ? 6_000 : 30_000),
  });
}

/**
 * 프로젝트의 컷 보드. 컷 없이 쓰는 프로젝트도 있어서, 컷이 없으면 "컷 없이 쌓인 클립"만 보여요.
 */
export function CutBoardView({
  projectId,
  projectName,
  canEdit,
  openCut,
  onOpenCut,
}: {
  projectId: string;
  projectName: string;
  canEdit: boolean;
  openCut: string | null;
  onOpenCut: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useCutBoard(projectId);
  const cuts = data?.cuts ?? [];
  const [order, setOrder] = React.useState<string[] | null>(null);
  const ordered = order ? order.map((id) => cuts.find((c) => c.id === id)).filter((c): c is CutDTO => !!c) : cuts;
  const refresh = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["cut-board", projectId] });
    void qc.invalidateQueries({ queryKey: ["cut-options", projectId] });
  }, [qc, projectId]);

  const totals = cuts.reduce(
    (t, c) => ({ takes: t.takes + c.counts.takes, ok: t.ok + c.counts.ok, keep: t.keep + c.counts.keep, ng: t.ng + c.counts.ng }),
    { takes: 0, ok: 0, keep: 0, ng: 0 },
  );
  const done = cuts.filter((c) => c.status === "done").length;

  async function add(count: number, code?: string) {
    try {
      const r = await fetchJson<{ items: { code: string }[] }>(`/api/projects/${projectId}/cuts`, { method: "POST", body: JSON.stringify({ count, code }) });
      toast.success(r.items.length === 1 ? `${r.items[0].code}를 만들었어요.` : `${r.items[0].code} – ${r.items.at(-1)!.code} (${r.items.length}개)`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveOrder(ids: string[]) {
    try {
      await fetchJson(`/api/projects/${projectId}/cuts`, { method: "PUT", body: JSON.stringify({ ids }) });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const current = openCut ? cuts.find((c) => c.id === openCut) : null;
  if (openCut && (current || openCut === "none")) {
    return <CutDetail projectId={projectId} projectName={projectName} cut={current ?? null} canEdit={canEdit} onBack={() => onOpenCut(null)} onChanged={refresh} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 요약 줄 */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <dl className="flex flex-wrap items-end gap-x-9 gap-y-3">
          <Stat label="컷" value={cuts.length} sub={cuts.length ? `확정 ${done}` : undefined} />
          <Stat label="테이크" value={totals.takes + (data?.loose.counts.takes ?? 0)} />
          <Stat label="OK" value={totals.ok} tone="text-success" />
          <Stat label="KEEP" value={totals.keep} tone="text-warning" />
          <Stat label="NG" value={totals.ng} tone="text-danger" />
        </dl>
        <div className="flex items-center gap-2">
          <ExportMenu projectId={projectId} cutId={null} label="프로젝트 내보내기" />
          {canEdit && <AddCuts existing={cuts.map((c) => c.code)} onAdd={add} />}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-[92px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {cuts.length === 0 && (
            <div className="grid gap-6 rounded-2xl border border-dashed border-line-2 px-6 py-8 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-[15px] font-semibold">이 프로젝트는 아직 컷을 나누지 않았어요</p>
                <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-fg-3">
                  컷 없이 프로젝트에 바로 쌓아도 돼요. 컷을 나누면 클립마다 테이크 번호가 붙고, 컷별로 OK·NG를 모아 보고, 받을 때 폴더와 파일 이름에 컷·테이크·판정이 들어가요.
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => add(1)}>
                    <Plus /> C001 만들기
                  </Button>
                  <Button variant="primary" onClick={() => add(10)}>
                    C001–C010
                  </Button>
                </div>
              )}
            </div>
          )}

          {cuts.length > 0 && (
            <Reorder.Group
              axis="y"
              values={ordered.map((c) => c.id)}
              onReorder={(ids) => setOrder(ids)}
              className="flex flex-col gap-2"
            >
              {ordered.map((c, i) => (
                <CutRow
                  key={c.id}
                  cut={c}
                  index={i}
                  canEdit={canEdit}
                  onOpen={() => onOpenCut(c.id)}
                  onChanged={refresh}
                  onDragEnd={() => {
                    if (order) void saveOrder(order);
                  }}
                />
              ))}
            </Reorder.Group>
          )}

          {!!data?.loose.counts.takes && (
            <button
              type="button"
              onClick={() => onOpenCut("none")}
              className="group grid grid-cols-[76px_1fr_auto] items-center gap-4 rounded-xl border border-line px-4 py-3 text-left transition hover:border-line-2 hover:bg-panel-2/40"
            >
              <span className="font-mono text-[12px] tracking-[0.12em] text-fg-4">—</span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium">컷 없이 쌓인 클립</span>
                <span className="font-mono text-[11px] text-fg-4">{data.loose.counts.takes}개 · 선택해서 컷으로 옮길 수 있어요</span>
              </span>
              <TakeStrip takes={data.loose.recent} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11.5px] text-fg-3">{label}</dt>
      <dd className={cn("font-display text-[30px] font-light leading-none tracking-[-0.02em]", tone)}>
        <RollingNumber value={value} />
      </dd>
      {sub && <dd className="font-mono text-[10.5px] text-fg-4">{sub}</dd>}
    </div>
  );
}

/* ---------------------------------- 컷 한 줄 ---------------------------------- */

function CutRow({ cut, index, canEdit, onOpen, onChanged, onDragEnd }: { cut: CutDTO; index: number; canEdit: boolean; onOpen: () => void; onChanged: () => void; onDragEnd: () => void }) {
  const controls = useDragControls();
  const live = cut.active.length > 0;
  return (
    <Reorder.Item
      value={cut.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 12) * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
      whileDrag={{ scale: 1.01, boxShadow: "0 24px 60px -24px rgba(0,0,0,0.6)" }}
      className={cn(
        "group relative grid grid-cols-[76px_1fr] items-center gap-4 rounded-xl border bg-panel px-4 py-3 transition-colors md:grid-cols-[76px_128px_minmax(0,1fr)_auto]",
        live ? "border-accent/40" : "border-line hover:border-line-2",
      )}
    >
      {live && <span aria-hidden className="pointer-events-none absolute inset-y-3 left-0 w-[2px] rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />}
      {/* 번호 */}
      <div className="flex items-center gap-1.5">
        {canEdit && (
          <button
            type="button"
            onPointerDown={(e) => controls.start(e)}
            className="-ml-2 cursor-grab touch-none rounded p-0.5 text-fg-4 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            aria-label="순서 바꾸기"
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <button type="button" onClick={onOpen} className="text-left font-mono text-[15px] font-semibold tracking-[0.04em] hover:text-accent">
          {cut.code}
        </button>
      </div>

      {/* 대표 */}
      <button type="button" onClick={onOpen} className="relative hidden aspect-video overflow-hidden rounded-lg bg-panel-3 md:block" aria-label={`${cut.code} 열기`}>
        {cut.cover ? (
          <MediaThumb kind={cut.cover.kind} thumb={cut.cover.urls.thumb} src={cut.cover.urls.src} durationSec={null} autoPlayOnHover={false} className="transition duration-500 group-hover:scale-[1.04]" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-[0.2em] text-fg-4">NO TAKE</span>
        )}
        {cut.cover?.flag && <VerdictBadge flag={cut.cover.flag} className="absolute bottom-1 left-1" />}
      </button>

      {/* 제목·상태·담당 */}
      <div className="col-span-2 flex min-w-0 flex-col gap-2 md:col-span-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={onOpen} className="min-w-0 truncate text-left text-[14px] font-medium hover:underline">
            {cut.title || <span className="text-fg-4">제목 없음</span>}
          </button>
          <StatusPicker cut={cut} canEdit={canEdit} onChanged={onChanged} />
          <AssigneePicker cut={cut} canEdit={canEdit} onChanged={onChanged} />
          <AnimatePresence>
            {live && (
              <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-[11.5px] text-accent">
                <span className="relative flex size-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative size-1.5 rounded-full bg-accent" />
                </span>
                {cut.active.map((a) => a.name).join(", ")} 생성 중
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-4">
          <span>T{cut.counts.takes}</span>
          {cut.counts.ok > 0 && <span className="text-success">OK {cut.counts.ok}</span>}
          {cut.counts.keep > 0 && <span className="text-warning">KEEP {cut.counts.keep}</span>}
          {cut.counts.ng > 0 && <span className="text-danger">NG {cut.counts.ng}</span>}
          <span className="font-sans">
            <TimeAgo date={cut.lastActivityAt} />
          </span>
        </div>
      </div>

      {/* 최근 테이크 */}
      <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-end">
        <TakeStrip takes={cut.recent} onClick={onOpen} />
        <CutMenu cut={cut} canEdit={canEdit} onOpen={onOpen} onChanged={onChanged} />
      </div>
    </Reorder.Item>
  );
}

function TakeStrip({ takes, onClick }: { takes: CutTake[]; onClick?: () => void }) {
  if (!takes.length) return <span className="font-mono text-[10.5px] text-fg-4">테이크 없음</span>;
  return (
    <div className="flex items-center gap-1" onClick={onClick}>
      {takes.slice(0, 8).map((t, i) => (
        <motion.span
          key={t.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.025 }}
          className="relative block h-9 w-12 overflow-hidden rounded-[5px] bg-panel-3"
          title={`${t.take ? `T${String(t.take).padStart(2, "0")}` : ""} · ${t.userName}`}
        >
          {t.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.urls.thumb} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center bg-panel-3 font-mono text-[9px] text-fg-3">MOV</span>
          )}
          {t.flag && <span className={cn("absolute inset-x-0 bottom-0 h-[3px]", VERDICT_STYLE[t.flag].solid)} />}
        </motion.span>
      ))}
    </div>
  );
}

/* ---------------------------------- 상태·담당 ---------------------------------- */

async function patchCut(id: string, body: Record<string, unknown>) {
  return fetchJson(`/api/cuts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

function StatusPicker({ cut, canEdit, onChanged }: { cut: CutDTO; canEdit: boolean; onChanged: () => void }) {
  const pill = (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line-2 px-2 text-[11.5px] text-fg-2">
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[cut.status], cut.status === "wip" && "animate-pulse-dot")} />
      {CUT_STATUS_LABEL[cut.status]}
      {canEdit && <ChevronDown className="size-3 text-fg-4" />}
    </span>
  );
  if (!canEdit) return pill;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button">{pill}</button>
      </MenuTrigger>
      <MenuContent align="start">
        {STATUS_ORDER.map((s) => (
          <MenuItem
            key={s}
            onSelect={async () => {
              await patchCut(cut.id, { status: s }).catch((e) => toast.error((e as Error).message));
              onChanged();
            }}
          >
            <span className={cn("size-1.5 rounded-full", STATUS_DOT[s])} /> {CUT_STATUS_LABEL[s]}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function AssigneePicker({ cut, canEdit, onChanged }: { cut: CutDTO; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const { data } = useDirectory("", open);
  const chip = cut.assignee ? (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full pl-0.5 pr-2 text-[11.5px] text-fg-2 hover:bg-panel-2">
      <Avatar name={cut.assignee.name} image={cut.assignee.image} size={20} />
      {cut.assignee.name}
    </span>
  ) : (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line-2 px-2 text-[11.5px] text-fg-4 hover:text-fg-2">
      <UserRound className="size-3" /> 담당
    </span>
  );
  if (!canEdit) return cut.assignee ? chip : null;
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <button type="button">{chip}</button>
      </MenuTrigger>
      <MenuContent align="start" className="max-h-[300px] w-[220px] overflow-y-auto">
        <MenuLabel>담당</MenuLabel>
        {(data?.people ?? []).map((p) => (
          <MenuItem
            key={p.id}
            onSelect={async () => {
              await patchCut(cut.id, { assigneeId: p.id }).catch((e) => toast.error((e as Error).message));
              onChanged();
            }}
          >
            <Avatar name={p.name} image={p.image} size={18} /> {p.name}
            {p.teamName && <span className="ml-auto text-[11px] text-fg-4">{p.teamName}</span>}
          </MenuItem>
        ))}
        {cut.assignee && (
          <>
            <MenuSeparator />
            <MenuItem
              onSelect={async () => {
                await patchCut(cut.id, { assigneeId: null });
                onChanged();
              }}
            >
              담당 비우기
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

function CutMenu({ cut, canEdit, onOpen, onChanged }: { cut: CutDTO; canEdit: boolean; onOpen: () => void; onChanged: () => void }) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="컷 메뉴">
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={onOpen}>
          <Clapperboard /> 테이크 보기
        </MenuItem>
        {canEdit && (
          <>
            <MenuItem onSelect={() => router.push(`/create/image?project=${cut.projectId}&cut=${cut.id}`)}>
              <ImagePlus /> 이 컷에서 이미지
            </MenuItem>
            <MenuItem onSelect={() => router.push(`/create/video?project=${cut.projectId}&cut=${cut.id}`)}>
              <Clapperboard /> 이 컷에서 영상
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onSelect={async () => {
                const code = window.prompt("컷 번호", cut.code);
                if (!code || code === cut.code) return;
                await patchCut(cut.id, { code }).catch((e) => toast.error((e as Error).message));
                onChanged();
              }}
            >
              번호 바꾸기
            </MenuItem>
            <MenuItem
              danger
              onSelect={async () => {
                if (!window.confirm(`${cut.code}를 지울까요? 클립은 지워지지 않고 "컷 없이 쌓인 클립"으로 돌아가요.`)) return;
                await fetchJson(`/api/cuts/${cut.id}`, { method: "DELETE" }).catch((e) => toast.error((e as Error).message));
                onChanged();
              }}
            >
              <Trash2 /> 컷 지우기
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

/* ---------------------------------- 추가·내보내기 ---------------------------------- */

function AddCuts({ existing, onAdd }: { existing: string[]; onAdd: (count: number, code?: string) => Promise<void> }) {
  const [count, setCount] = React.useState(5);
  const [code, setCode] = React.useState("");
  const preview = code.trim() ? [code.trim().toUpperCase(), ...nextCutCodes([...existing, code.trim().toUpperCase()], Math.max(0, count - 1))] : nextCutCodes(existing, count);
  return (
    <div className="flex items-center">
      <Button variant="primary" className="rounded-r-none" onClick={() => onAdd(1)}>
        <Plus /> {nextCutCodes(existing, 1)[0]}
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="primary" className="rounded-l-none border-l border-black/15 px-2" aria-label="여러 개 만들기">
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[280px] p-4">
          <p className="text-[13px] font-semibold">컷 여러 개 만들기</p>
          <div className="mt-3 grid grid-cols-[1fr_84px] gap-2">
            <label className="flex flex-col gap-1 text-[11.5px] text-fg-3">
              시작 번호 (비우면 이어서)
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={nextCutCodes(existing, 1)[0]} className="h-9 rounded-lg border border-line-2 bg-panel-2 px-2.5 font-mono text-[13px] outline-none focus:border-fg-3" />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-fg-3">
              개수
              <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="h-9 rounded-lg border border-line-2 bg-panel-2 px-2.5 font-mono text-[13px] outline-none focus:border-fg-3" />
            </label>
          </div>
          <p className="mt-2 font-mono text-[11px] text-fg-3">
            {preview[0]} {preview.length > 1 && `– ${preview.at(-1)}`}
          </p>
          <Button variant="primary" className="mt-3 w-full" onClick={() => onAdd(count, code.trim() || undefined).then(() => setCode(""))}>
            {count}개 만들기
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const EXPORTS: { label: string; hint: string; verdicts: (Flag | "none")[] }[] = [
  { label: "OK만", hint: "편집에 쓸 테이크", verdicts: ["pick"] },
  { label: "OK + KEEP", hint: "보류까지", verdicts: ["pick", "keep"] },
  { label: "전체", hint: "판정 없는 것 포함", verdicts: [] },
];

export function ExportMenu({ projectId, cutId, label = "내보내기" }: { projectId: string; cutId: string | null; label?: string }) {
  const [busy, setBusy] = React.useState(false);
  async function run(verdicts: (Flag | "none")[]) {
    setBusy(true);
    const t = toast.loading("파일을 모으는 중…");
    try {
      const p = new URLSearchParams();
      if (cutId) p.set("cutId", cutId);
      if (verdicts.length) p.set("verdicts", verdicts.join(","));
      const r = await fetchJson<{ zipName: string; files: { path: string; url: string }[]; csv: string }>(`/api/projects/${projectId}/export?${p}`);
      if (!r.files.length) {
        toast.message("받을 클립이 없어요.", { id: t });
        return;
      }
      const root = r.files[0].path.split("/")[0];
      await downloadZip(
        r.files.map((f) => ({ url: f.url, filename: f.path })),
        r.zipName,
        [{ name: `${root}/shotlist.csv`, text: r.csv }],
      );
      toast.success(`${r.files.length}개를 묶었어요. 폴더는 프로젝트/컷, 파일 끝에 OK·KEEP·NG가 붙어요.`, { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" loading={busy}>
          <Download /> {label}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-[230px]">
        <MenuLabel>폴더 = 프로젝트 / 컷 · 샷 리스트 CSV 포함</MenuLabel>
        {EXPORTS.map((x) => (
          <MenuItem key={x.label} onSelect={() => void run(x.verdicts)}>
            <span className="font-medium">{x.label}</span>
            <span className="ml-auto text-[11px] text-fg-4">{x.hint}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/* ---------------------------------- 컷 상세 ---------------------------------- */

function CutDetail({
  projectId,
  projectName,
  cut,
  canEdit,
  onBack,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  cut: CutDTO | null;
  canEdit: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(cut?.title ?? "");
  const [note, setNote] = React.useState(cut?.note ?? "");
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function save(body: Record<string, unknown>) {
    if (!cut) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void patchCut(cut.id, body)
        .then(onChanged)
        .catch((e) => toast.error((e as Error).message));
    }, 500);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex min-w-0 flex-col gap-3">
          <button type="button" onClick={onBack} className="flex w-fit items-center gap-1.5 text-[12.5px] text-fg-3 hover:text-fg">
            <ArrowLeft className="size-3.5" /> 컷 목록
          </button>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-2">
            <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[34px] font-semibold leading-none tracking-[0.02em]">
              {cut?.code ?? "—"}
            </motion.span>
            {cut ? (
              canEdit ? (
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    save({ title: e.target.value });
                  }}
                  placeholder="컷 제목 (예: 오프닝 드론샷)"
                  className="min-w-[240px] bg-transparent text-[20px] font-medium outline-none placeholder:text-fg-4"
                />
              ) : (
                <span className="text-[20px] font-medium">{cut.title}</span>
              )
            ) : (
              <span className="text-[20px] font-medium">컷 없이 쌓인 클립</span>
            )}
          </div>
          {cut && (
            <div className="flex flex-wrap items-center gap-3">
              <StatusPicker cut={cut} canEdit={canEdit} onChanged={onChanged} />
              <AssigneePicker cut={cut} canEdit={canEdit} onChanged={onChanged} />
              <span className="font-mono text-[11px] text-fg-4">
                {projectName} / {cut.code} · T{cut.counts.takes} · OK {cut.counts.ok} · KEEP {cut.counts.keep} · NG {cut.counts.ng}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cut && canEdit && (
            <>
              <Button variant="primary" onClick={() => router.push(`/create/image?project=${projectId}&cut=${cut.id}`)}>
                <ImagePlus /> 이미지
              </Button>
              <Button variant="secondary" onClick={() => router.push(`/create/video?project=${projectId}&cut=${cut.id}`)}>
                <Clapperboard /> 영상
              </Button>
            </>
          )}
          {cut && <ExportMenu projectId={projectId} cutId={cut.id} />}
        </div>
      </div>

      {cut && canEdit && (
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            save({ note: e.target.value });
          }}
          rows={2}
          placeholder="연출 메모 — 앵글, 무드, 레퍼런스 링크, 다음 테이크에서 바꿀 점"
          className="w-full resize-y rounded-xl border border-line bg-panel/60 px-4 py-3 text-[13.5px] leading-relaxed outline-none transition placeholder:text-fg-4 focus:border-line-3"
        />
      )}
      {cut && !canEdit && cut.note && <p className="whitespace-pre-wrap rounded-xl border border-line px-4 py-3 text-[13.5px] text-fg-2">{cut.note}</p>}

      {cut?.cover && canEdit && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-fg-4">
          <Pin className="size-3" /> 대표 테이크는 OK 중 가장 최근 것이에요. 클립을 열어 OK·KEEP·NG를 정하면 여기 숫자가 바로 바뀌어요.
        </p>
      )}

      <AssetBrowser projectId={projectId} cutId={cut?.id ?? "none"} canEdit={canEdit} hideScope />
    </div>
  );
}

