"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Clapperboard, Copy, ImagePlus, Inbox, MessagesSquare, MoreHorizontal, Search, Send, Trash2, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { MediaThumb } from "@/components/assets/media";
import { VerdictBadge } from "@/components/assets/selection-controls";
import { Pill } from "@/components/brand/hud";
import { ShareDialog } from "@/components/prompts/share-dialog";
import { useShellMaybe } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar, TimeAgo } from "@/components/ui/misc";
import { getModel } from "@/lib/models/registry";
import type { LibraryItem, LibraryTab, PromptMessageDTO } from "@/lib/services/prompt-docs";
import { cn, fetchJson } from "@/lib/utils";

export type { LibraryItem, LibraryTab };

const TABS: { value: LibraryTab; label: string; hint: string }[] = [
  { value: "saved", label: "저장", hint: "내가 저장한 프롬프트" },
  { value: "inbox", label: "받은", hint: "나에게 보낸 프롬프트" },
  { value: "team", label: "팀·전사", hint: "우리 팀과 전사에 공유된 프롬프트" },
  { value: "sent", label: "보낸", hint: "내가 보낸 프롬프트" },
];

const EMPTY: Record<LibraryTab, { title: string; body: string }> = {
  saved: { title: "저장한 프롬프트가 없어요", body: "스튜디오에서 ‘라이브러리에 저장’을 누르면 여기에 모여요." },
  inbox: { title: "받은 프롬프트가 없어요", body: "동료가 보내면 알림과 함께 여기에 들어와요." },
  team: { title: "팀에 공유된 프롬프트가 없어요", body: "결과 클립에서 ‘보내기’ → 우리 팀을 고르면 여기에 올라와요." },
  sent: { title: "보낸 프롬프트가 없어요", body: "결과 클립이나 저장한 프롬프트에서 ‘보내기’를 눌러 보세요." },
};

export function usePromptLibrary(opts: { tab: LibraryTab; q: string; kind?: string }) {
  return useQuery({
    queryKey: ["prompt-library", opts],
    queryFn: () => {
      const p = new URLSearchParams({ tab: opts.tab, q: opts.q });
      if (opts.kind) p.set("kind", opts.kind);
      return fetchJson<{ items: LibraryItem[]; unseen: number }>(`/api/prompts?${p}`);
    },
    placeholderData: (prev) => prev,
  });
}

/**
 * 프롬프트 라이브러리 — 저장 · 받은 · 팀·전사 · 보낸이 한곳에. 고르면 오른쪽에 내용·클립·대화가 열려요.
 * page: /prompts 전체 화면, picker: 스튜디오에서 불러오기 (고르면 onUse)
 */
export function PromptLibrary({
  mode = "page",
  kind,
  initialTab = "saved",
  initialOpen = null,
  onUse,
  isAdmin = false,
  className,
  toolbarEnd,
}: {
  mode?: "page" | "picker";
  kind?: "image" | "video";
  initialTab?: LibraryTab;
  initialOpen?: string | null;
  onUse?: (item: LibraryItem) => void;
  isAdmin?: boolean;
  className?: string;
  toolbarEnd?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = React.useState<LibraryTab>(initialTab);
  const [q, setQ] = React.useState("");
  const dq = React.useDeferredValue(q.trim());
  const { data, isLoading, isFetching } = usePromptLibrary({ tab, q: dq, kind });
  const items = React.useMemo(() => data?.items ?? [], [data]);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialOpen);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const [sendFor, setSendFor] = React.useState<LibraryItem | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  // 처음 열 때(알림에서 온 경우) 그 항목, 아니면 첫 항목
  const [autoPicked, setAutoPicked] = React.useState(false);
  if (!autoPicked && data && !isFetching) {
    setAutoPicked(true);
    if (!items.some((i) => i.id === selectedId) && mode === "page" && typeof window !== "undefined" && window.innerWidth >= 1024) setSelectedId(items[0]?.id ?? null);
  }

  const refresh = () => void qc.invalidateQueries({ queryKey: ["prompt-library"] });

  function use(item: LibraryItem, k?: "image" | "video") {
    void fetchJson(`/api/prompts/${item.id}`, { method: "PATCH", body: JSON.stringify({ used: true }) }).catch(() => {});
    if (onUse) onUse(item);
    else router.push(`/create/${k ?? (item.kind === "video" ? "video" : "image")}?preset=${item.id}`);
  }

  async function unshare(item: LibraryItem) {
    try {
      await fetchJson(`/api/prompts/${item.id}/share`, { method: "DELETE" });
      toast.success("보낸 공유를 거뒀어요. 저장은 그대로 있어요.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(item: LibraryItem) {
    if (!(await confirm({ title: `‘${item.title}’을(를) 지울까요?`, description: "버전 기록과 대화, 보낸 공유도 함께 지워져요.", confirmLabel: "삭제", danger: true }))) return;
    try {
      await fetchJson(`/api/prompts/${item.id}`, { method: "DELETE" });
      toast.success("지웠어요.");
      setSelectedId(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className={cn("grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]", className)}>
      {/* 목록 */}
      <div className={cn("flex min-h-0 min-w-0 flex-col", selected && "hidden lg:flex")}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-1 pb-0">
          <nav className="-mb-px flex items-center" role="tablist">
            {TABS.map((t) => {
              const active = t.value === tab;
              const badge = t.value === "inbox" ? (data?.unseen ?? 0) : 0;
              return (
                <button
                  key={t.value}
                  role="tab"
                  aria-selected={active}
                  title={t.hint}
                  onClick={() => {
                    setTab(t.value);
                    setSelectedId(null);
                    setAutoPicked(false);
                  }}
                  className={cn(
                    "relative flex h-11 items-center gap-1.5 px-3.5 text-[13.5px] transition-colors",
                    active ? "text-fg" : "text-fg-3 hover:text-fg-2",
                  )}
                >
                  {t.label}
                  {badge > 0 && <span className="rounded-full bg-accent px-1.5 font-mono text-[10px] font-semibold leading-4 text-on-accent shadow-[0_0_10px_var(--accent-glow)]">{badge}</span>}
                  {active && <motion.span layoutId={`lib-tab-${mode}`} className="absolute inset-x-2 bottom-0 h-px bg-accent shadow-[0_0_10px_var(--accent-glow)]" transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />}
                </button>
              );
            })}
          </nav>
          <div className="relative ml-auto w-full min-w-[180px] pb-2 sm:w-auto sm:flex-1 sm:pb-0 lg:max-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-4 sm:top-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목·내용·태그"
              className="h-8 w-full rounded-full border border-line-2 bg-white/[0.03] pl-8 pr-3 text-[13px] outline-none transition placeholder:text-fg-4 focus:border-accent/60"
            />
          </div>
          {toolbarEnd}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2 pr-1 scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col gap-1.5 p-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-[74px] rounded-xl" />
              ))}
            </div>
          ) : !items.length ? (
            <div className="corners corners-dashed m-1 flex flex-col items-center rounded-[14px] px-6 py-14 text-center">
              <Inbox className="size-5 text-fg-4" />
              <p className="mt-3 text-[13.5px] text-fg-2">{dq ? "검색 결과가 없어요" : EMPTY[tab].title}</p>
              <p className="mt-1 max-w-sm text-[12px] text-fg-4">{dq ? "다른 단어로 찾아보세요. 태그도 함께 검색돼요." : EMPTY[tab].body}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1 p-1">
              {items.map((item, i) => (
                <motion.li key={`${tab}-${item.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.025 }}>
                  <ItemRow item={item} tab={tab} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 오른쪽: 선택한 프롬프트 */}
      <div className={cn("min-h-0 min-w-0 border-line lg:border-l", !selected && "hidden lg:block")}>
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected.id} className="h-full" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <Inspector
                item={selected}
                mode={mode}
                canManage={selected.mine || isAdmin}
                onBack={() => setSelectedId(null)}
                onUse={(k) => use(selected, k)}
                onSend={() => setSendFor(selected)}
                onUnshare={() => void unshare(selected)}
                onDelete={() => void remove(selected)}
              />
            </motion.div>
          ) : (
            <div className="hidden h-full flex-col items-center justify-center gap-2 p-10 text-center lg:flex">
              <MessagesSquare className="size-5 text-fg-4" />
              <p className="text-[12.5px] text-fg-4">왼쪽에서 프롬프트를 고르면 내용과 대화가 열려요.</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      <ShareDialog
        open={!!sendFor}
        onOpenChange={(v) => !v && setSendFor(null)}
        presetId={sendFor?.id}
        defaultTitle={sendFor?.title}
        preview={sendFor?.clip ? { thumb: sendFor.clip.thumb, kind: sendFor.clip.kind, prompt: sendFor.prompt } : null}
        onSent={() => refresh()}
      />
      {confirmDialog}
    </div>
  );
}

function ItemRow({ item, tab, selected, onSelect }: { item: LibraryItem; tab: LibraryTab; selected: boolean; onSelect: () => void }) {
  const model = item.modelId ? getModel(item.modelId) : null;
  const s = item.share;
  const unseen = tab === "inbox" && s && !s.seen;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative grid w-full grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-xl p-2 text-left transition",
        selected ? "bg-white/[0.05] ring-1 ring-accent/35" : "hover:bg-white/[0.03]",
      )}
    >
      {selected && <span aria-hidden className="absolute inset-y-3 -left-1 w-px bg-accent shadow-[0_0_8px_var(--accent-glow)]" />}
      <span className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-panel-3 ring-1 ring-white/[0.06]">
        {item.clip ? (
          <MediaThumb kind={item.clip.kind} thumb={item.clip.thumb} src={item.clip.src} durationSec={null} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-fg-4">
            {item.kind === "video" ? <Clapperboard className="size-4" /> : <ImagePlus className="size-4" />}
          </span>
        )}
        {item.clip?.flag && <VerdictBadge flag={item.clip.flag} className="absolute bottom-1 left-1 scale-90" />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
        <span className="flex items-center gap-2">
          {unseen && <span className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_6px_var(--accent-glow)]" />}
          <span className={cn("truncate text-[13.5px]", unseen ? "font-semibold text-fg" : "font-medium text-fg")}>{item.title}</span>
          <span className="ml-auto shrink-0 text-[10.5px] text-fg-4">
            <TimeAgo date={s?.at ?? item.updatedAt} />
          </span>
        </span>
        {s?.message ? (
          <span className="line-clamp-1 text-[12.5px] text-fg-2">“{s.message}”</span>
        ) : (
          <span className="line-clamp-1 text-[12.5px] text-fg-3">{item.prompt}</span>
        )}
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-fg-4">
          {s ? (
            <span className="truncate">
              {s.from} <span className="text-fg-4/70">→</span> {s.to ?? "—"}
            </span>
          ) : (
            <span className="truncate">{item.tags.length ? item.tags.map((t) => `#${t}`).join(" ") : item.owner}</span>
          )}
          {model && <span className="shrink-0">· {model.shortName}</span>}
          {item.latestVersion > 1 && <span className="shrink-0 font-mono">· v{item.latestVersion}</span>}
          {item.messages > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-fg-3">
              <MessagesSquare className="size-3" />
              {item.messages}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/*                                          인스펙터                                               */
/* ---------------------------------------------------------------------------------------------- */

function Inspector({
  item,
  mode,
  canManage,
  onBack,
  onUse,
  onSend,
  onUnshare,
  onDelete,
}: {
  item: LibraryItem;
  mode: "page" | "picker";
  canManage: boolean;
  onBack: () => void;
  onUse: (k?: "image" | "video") => void;
  onSend: () => void;
  onUnshare: () => void;
  onDelete: () => void;
}) {
  const me = useShellMaybe()?.user.id;
  const mySend = !!item.share && item.share.fromId === me;
  const model = item.modelId ? getModel(item.modelId) : null;
  const c = item.clip;
  const targets: ("image" | "video")[] = item.kind === "any" ? ["image", "video"] : [item.kind];
  const ratio = c?.width && c?.height ? Math.max(0.9, Math.min(2, c.width / c.height)) : 16 / 9;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="flex flex-col gap-4 p-4 lg:p-5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-xs" className="-ml-1 lg:hidden" onClick={onBack} aria-label="목록으로">
              <ArrowLeft />
            </Button>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-4">
              {item.kind === "any" ? "image · video" : item.kind}
              {model ? ` · ${model.shortName}` : ""}
              {` · v${item.latestVersion}`}
            </span>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="더보기">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem
                  onSelect={async () => {
                    await navigator.clipboard.writeText(item.prompt);
                    toast.success("프롬프트를 복사했어요.");
                  }}
                >
                  <Copy /> 프롬프트 복사
                </MenuItem>
                <MenuItem asChild>
                  <Link href={`/prompts/${item.id}`}>
                    <ArrowUpRight /> 버전 기록 열기
                  </Link>
                </MenuItem>
                {(mySend || canManage) && <MenuSeparator />}
                {mySend && (
                  <MenuItem onSelect={onUnshare}>
                    <Undo2 /> 내가 보낸 공유 거두기
                  </MenuItem>
                )}
                {canManage && (
                  <MenuItem danger onSelect={onDelete}>
                    <Trash2 /> 삭제
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </div>

          <div>
            <h2 className="text-[20px] font-medium leading-snug tracking-[-0.02em]">{item.title}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
              {item.share ? (
                <>
                  <Avatar name={item.share.from} size={18} />
                  <span className="text-fg-2">{item.share.from}</span>
                  <span className="text-fg-4">→</span>
                  <Pill tone={item.share.target === "user" ? "accent" : "line"} className="h-5 px-2 text-[10.5px]">
                    {item.share.to ?? "—"}
                  </Pill>
                  <TimeAgo date={item.share.at} className="text-fg-4" />
                </>
              ) : (
                <>
                  <span>{item.owner}</span>
                  <span className="text-fg-4">·</span>
                  <TimeAgo date={item.updatedAt} className="text-fg-4" />
                </>
              )}
            </p>
          </div>

          {c && (
            <Link href={`/library?asset=${c.assetId}`} className="group relative block max-h-[300px] w-full overflow-hidden rounded-xl bg-panel-3 ring-1 ring-white/[0.07]" style={{ aspectRatio: String(ratio) }} title="원본 클립 열기">
              <MediaThumb kind={c.kind} thumb={c.thumb} src={c.src} durationSec={c.durationSec} className="transition duration-700 group-hover:scale-[1.02]" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-1.5 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-10">
                <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-white/85">
                  {c.projectName}
                  {c.cutCode ? ` / ${c.cutCode}` : ""}
                  {c.take ? ` · T${String(c.take).padStart(2, "0")}` : ""}
                </span>
                <VerdictBadge flag={c.flag} className="ml-auto shrink-0" />
              </span>
            </Link>
          )}

          <div className="corners relative rounded-xl border border-line bg-white/[0.015] p-3.5">
            <p className="max-h-[260px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2 scrollbar-thin">{item.prompt}</p>
            {item.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <span key={t} className="rounded-full border border-line-2 px-2 py-0.5 text-[11px] text-fg-3">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {targets.map((k, i) => (
              <Button key={k} variant={i === 0 ? "primary" : "secondary"} size="sm" onClick={() => onUse(k)}>
                {k === "image" ? <ImagePlus /> : <Clapperboard />}
                {mode === "picker" ? "이 프롬프트 쓰기" : targets.length > 1 ? (k === "image" ? "이미지로 쓰기" : "영상으로 쓰기") : "스튜디오에서 쓰기"}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={onSend}>
              <Send /> 보내기
            </Button>
          </div>
        </div>

        <Thread presetId={item.id} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/*                                             대화                                                */
/* ---------------------------------------------------------------------------------------------- */

function Thread({ presetId }: { presetId: string }) {
  const qc = useQueryClient();
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: ["prompt-messages", presetId],
    queryFn: () => fetchJson<{ items: PromptMessageDTO[]; shares: { from: string; to: string | null; target: string; at: string }[] }>(`/api/prompts/${presetId}/messages`),
    // 열어 둔 동안만 4초마다
    refetchInterval: 4000,
  });
  const count = data?.items.length ?? 0;
  // 처음 열 때는 위(내용)부터 보이게 두고, 새 메시지가 오면 아래로
  const prevCount = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!data) return;
    if (prevCount.current === null) {
      // 열면 "봤음"·알림 읽음이 되니 뱃지를 새로
      void qc.invalidateQueries({ queryKey: ["prompt-library"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    } else if (count > prevCount.current) {
      endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    prevCount.current = count;
  }, [data, count, qc]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await fetchJson<{ item: PromptMessageDTO }>(`/api/prompts/${presetId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      qc.setQueryData(["prompt-messages", presetId], (old: typeof data) => (old ? { ...old, items: [...old.items, r.item] } : old));
      setText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  // 공유 기록과 메시지를 시간순으로
  const events = [
    ...(data?.shares ?? []).map((s) => ({ type: "share" as const, at: s.at, s })),
    ...(data?.items ?? []).map((m) => ({ type: "msg" as const, at: m.at, m })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="border-t border-line">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4 lg:px-5">
        <span className="font-mono text-[10.5px] tracking-[0.14em] text-fg-4">TALK /</span>
        <span className="text-[13px] text-fg-2">대화</span>
        <span className="ml-auto text-[11px] text-fg-4">{count ? `${count}개` : "아직 없어요"}</span>
      </header>
      <div className="flex flex-col gap-2.5 px-4 pb-3 lg:px-5">
        {events.map((e, i) =>
          e.type === "share" ? (
            <p key={`s${i}`} className="flex items-center gap-2 py-0.5 text-[11px] text-fg-4">
              <span className="h-px flex-1 bg-line" />
              {e.s.from} → {e.s.to ?? "—"} · <TimeAgo date={e.s.at} />
              <span className="h-px flex-1 bg-line" />
            </p>
          ) : (
            <div key={e.m.id} className={cn("flex items-end gap-2", e.m.mine && "flex-row-reverse")}>
              {!e.m.mine && <Avatar name={e.m.name} image={e.m.image} size={24} />}
              <div className={cn("max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed", e.m.mine ? "rounded-br-md bg-accent/15 text-fg ring-1 ring-accent/25" : "rounded-bl-md bg-white/[0.05] text-fg-2 ring-1 ring-white/[0.06]")}>
                {!e.m.mine && <span className="mb-0.5 block text-[11px] font-medium text-fg-3">{e.m.name}</span>}
                <span className="whitespace-pre-wrap break-words">{e.m.body}</span>
                <TimeAgo date={e.m.at} className="mt-1 block text-right text-[10px] text-fg-4" />
              </div>
            </div>
          ),
        )}
        <div ref={endRef} className="scroll-mb-20" />
      </div>
      <form
        className="sticky bottom-0 flex items-end gap-2 border-t border-line bg-[rgb(8_11_15/0.9)] p-3 backdrop-blur-xl lg:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
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
          placeholder="메시지 — Enter 보내기, Shift+Enter 줄바꿈"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-2xl border border-line-2 bg-white/[0.03] px-3.5 py-2 text-[13px] leading-relaxed outline-none transition placeholder:text-fg-4 focus:border-accent/60"
        />
        <Button type="submit" variant="accent" size="icon-sm" disabled={!text.trim()} loading={sending} aria-label="보내기">
          {!sending && <Send />}
        </Button>
      </form>
    </section>
  );
}
