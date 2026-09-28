"use client";

import { ArrowRight, AtSign, Check, ChevronDown, CircleAlert, CircleHelp, ListOrdered, Pencil, Plus, Sparkles, Unlink, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { formatMention, type LinkStatus, MENTION_STYLE_LABEL, type MentionGroup, type MentionStyle, type RefItem } from "@/lib/prompt/mentions";
import { cn } from "@/lib/utils";

export type MentionRef = RefItem & { src?: string };

const STATUS: Record<LinkStatus, { label: string; tone: string; icon: React.ElementType }> = {
  linked: { label: "연결됨", tone: "text-success", icon: Check },
  guessed: { label: "추정", tone: "text-info", icon: Sparkles },
  missing: { label: "없음", tone: "text-danger", icon: CircleAlert },
  ambiguous: { label: "선택 필요", tone: "text-warning", icon: CircleHelp },
  unknown: { label: "선택 필요", tone: "text-warning", icon: CircleHelp },
};

const KIND_KO = { image: "이미지", video: "영상", audio: "오디오" } as const;

/**
 * 레퍼런스 언급 정리: 프롬프트의 @언급 ↔ 붙인 레퍼런스를 한눈에 보고, 연결을 바꾸고, 모델 형식으로 한 번에 정리.
 */
export function MentionPanel({
  groups,
  refs,
  style,
  modelName,
  pendingChanges,
  canReorder,
  onNormalize,
  onRelink,
  onRename,
  onInsert,
  onReorder,
  onFocus,
}: {
  groups: MentionGroup[];
  refs: MentionRef[];
  style: MentionStyle | null;
  modelName: string;
  /** 정리하면 바뀌는 언급 수 */
  pendingChanges: number;
  canReorder: boolean;
  onNormalize: () => void;
  onRelink: (key: string, refId: string | null) => void;
  onRename: (key: string, to: string) => void;
  onInsert: (text: string) => void;
  onReorder: () => void;
  onFocus: (start: number, end: number) => void;
}) {
  const byId = new Map(refs.map((r) => [r.id, r]));
  const mentionedIds = new Set(groups.map((g) => g.refId).filter(Boolean) as string[]);
  const unmentioned = refs.filter((r) => !mentionedIds.has(r.id));
  const issues = groups.filter((g) => g.status === "missing" || g.status === "ambiguous" || g.status === "unknown").length;

  if (!style) {
    return (
      <Hint
        title="이 모델은 레퍼런스를 받지 않아요"
        desc="레퍼런스(이미지·영상)를 받는 모델을 고르면, 프롬프트 속 @언급과 붙인 레퍼런스의 연결을 여기서 한눈에 보고 정리할 수 있어요."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 모델 형식 + 한 번에 정리 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line-2 bg-bg-2/60 px-3 py-2.5">
        <AtSign className="size-4 text-accent" />
        <span className="text-[12.5px] text-fg-2">
          <b className="font-medium text-fg">{modelName}</b> 모델은 레퍼런스를{" "}
          <code className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[12px] text-fg">{formatMention("image", 1, style)}</code>처럼 불러요
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {canReorder && (
            <Button variant="ghost" size="xs" onClick={onReorder}>
              <ListOrdered /> 언급 순서로 레퍼런스 정렬
            </Button>
          )}
          <Button variant={pendingChanges ? "primary" : "secondary"} size="xs" disabled={!pendingChanges} onClick={onNormalize}>
            <Wand2 /> {pendingChanges ? `${MENTION_STYLE_LABEL[style]} 형식으로 정리 (${pendingChanges}곳)` : "정리할 곳 없음"}
          </Button>
        </div>
      </div>

      {!groups.length && !refs.length && (
        <Hint
          title="아직 언급도, 레퍼런스도 없어요"
          desc={`레퍼런스를 붙이면 각 썸네일에 ${formatMention("image", 1, style)} 같은 이름표가 생겨요. 눌러서 프롬프트에 넣거나, 다른 곳에서 가져온 @img · @image1 · 커스텀 이름도 여기서 한 번에 맞출 수 있어요.`}
        />
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-1 text-[11.5px] text-fg-4">
            <span>프롬프트 속 언급 {groups.length}개</span>
            {issues > 0 ? <span className="text-warning">· 확인 필요 {issues}개</span> : <span className="text-success">· 모두 연결됨</span>}
            <span className="ml-auto">언급(눌러서 번호 바꾸기) → 가리키는 레퍼런스 → 정리 후</span>
          </div>
          <ol className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {groups.map((g) => (
                <GroupRow
                  key={g.key}
                  group={g}
                  refs={refs}
                  target={g.refId && byId.get(g.refId) ? formatMention(byId.get(g.refId)!.kind, byId.get(g.refId)!.order, style) : null}
                  onRelink={(id) => onRelink(g.key, id)}
                  onRename={(to) => onRename(g.key, to)}
                  onFocus={() => onFocus(g.mentions[0].start, g.mentions[0].end)}
                />
              ))}
            </AnimatePresence>
          </ol>
        </div>
      )}

      {unmentioned.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-line-2 p-2.5">
          <span className="px-0.5 text-[11.5px] text-fg-4">프롬프트에서 부르지 않은 레퍼런스 — 누르면 커서 자리에 넣어요</span>
          <div className="flex flex-wrap gap-2">
            {unmentioned.map((r) => {
              const tag = formatMention(r.kind, r.order, style);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onInsert(tag)}
                  className="group flex items-center gap-2 rounded-lg border border-line-2 bg-panel py-1 pl-1 pr-2.5 text-left transition hover:border-accent/50"
                >
                  <Thumb r={r} className="size-8" />
                  <span className="flex flex-col">
                    <span className="font-mono text-[11.5px] text-fg">{tag}</span>
                    <span className="max-w-[120px] truncate text-[10.5px] text-fg-4">{r.filename}</span>
                  </span>
                  <Plus className="size-3.5 text-fg-4 group-hover:text-accent" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-fg-4">
        다른 곳에서 가져온 <code className="font-mono">@img</code> · <code className="font-mono">@image1</code> · <code className="font-mono">[Image 2]</code> · 커스텀 이름(
        <code className="font-mono">@jacket</code>)도 찾아서 번호·파일명으로 연결해요. 틀리면 가운데에서 직접 골라 주세요. 레퍼런스는 붙인 순서가 곧 번호예요.
      </p>
    </div>
  );
}

function GroupRow({
  group,
  refs,
  target,
  onRelink,
  onRename,
  onFocus,
}: {
  group: MentionGroup;
  refs: MentionRef[];
  target: string | null;
  onRelink: (id: string | null) => void;
  onRename: (to: string) => void;
  onFocus: () => void;
}) {
  const ref = refs.find((r) => r.id === group.refId) ?? null;
  const st = STATUS[group.status];
  const StIcon = st.icon;
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(group.label);
  const changes = target && target !== group.label;

  return (
    <motion.li layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border px-2.5 py-2",
          group.status === "missing" ? "border-danger/30 bg-danger/[0.04]" : group.status === "linked" || group.status === "guessed" ? "border-line" : "border-warning/30 bg-warning/[0.04]",
        )}
      >
        {/* 언급: 눌러서 다른 번호로 바꾸기 (@img8 → @img3) */}
        <div className="flex min-w-0 items-center gap-1.5">
          {renaming ? (
            <form
              className="flex min-w-0 items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && name.trim() !== group.label) onRename(name.trim());
                setRenaming(false);
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setRenaming(false)}
                className="h-7 w-full min-w-0 rounded-md border border-line-2 bg-panel px-2 font-mono text-[12px] outline-none focus:border-accent/60"
              />
            </form>
          ) : (
            <>
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-1 rounded-md border border-line-2 bg-white/[0.04] py-0.5 pl-1.5 pr-1 font-mono text-[12.5px] text-fg transition hover:border-accent/50"
                    title="다른 번호·이름으로 바꾸기"
                  >
                    <span className="truncate">{group.label}</span>
                    <ChevronDown className="size-3 shrink-0 text-fg-4" />
                  </button>
                </MenuTrigger>
                <MenuContent align="start" className="w-72">
                  <MenuLabel>
                    {group.label} 바꾸기{group.mentions.length > 1 ? ` · ${group.mentions.length}곳 모두` : ""}
                  </MenuLabel>
                  {refs.map((r) => {
                    const own = sameStyle(group.label, r);
                    return (
                      <MenuItem key={r.id} disabled={own === group.label} onSelect={() => onRename(own)}>
                        <Thumb r={r} className="size-7" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[12.5px]">{own}</span>
                          <span className="block truncate text-[11px] text-fg-4">
                            {KIND_KO[r.kind]} {r.order} · {r.filename}
                          </span>
                        </span>
                        {r.id === group.refId && <Check className="size-3.5 text-accent" />}
                      </MenuItem>
                    );
                  })}
                  {!refs.length && <div className="px-2 py-2 text-[12px] text-fg-4">붙인 레퍼런스가 없어요</div>}
                  <MenuSeparator />
                  <MenuItem onSelect={() => setRenaming(true)}>
                    <Pencil /> 직접 입력해서 바꾸기
                  </MenuItem>
                  <MenuItem onSelect={onFocus}>
                    <AtSign /> 프롬프트에서 위치 보기
                  </MenuItem>
                </MenuContent>
              </Menu>
              {group.mentions.length > 1 && <span className="shrink-0 font-mono text-[10.5px] text-fg-4">×{group.mentions.length}</span>}
            </>
          )}
        </div>

        <ArrowRight className="size-3.5 text-fg-4" />

        {/* 레퍼런스 고르기 */}
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="flex min-w-0 items-center gap-2 rounded-lg border border-line-2 bg-panel py-1 pl-1 pr-2 text-left transition hover:border-line-3">
              {ref ? <Thumb r={ref} className="size-7" /> : <span className="flex size-7 items-center justify-center rounded-md bg-panel-3 text-fg-4"><Unlink className="size-3.5" /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-fg">{ref ? `${KIND_KO[ref.kind]} ${ref.order}` : "연결 안 됨"}</span>
                <span className="block truncate text-[10.5px] text-fg-4">{ref ? ref.filename : group.reason}</span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-fg-4" />
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="w-64">
            <MenuLabel>{group.label} 이(가) 가리키는 레퍼런스</MenuLabel>
            {refs.map((r) => (
              <MenuItem key={r.id} onSelect={() => onRelink(r.id)}>
                <Thumb r={r} className="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px]">
                    {KIND_KO[r.kind]} {r.order}
                  </span>
                  <span className="block truncate text-[11px] text-fg-4">{r.filename}</span>
                </span>
                {r.id === group.refId && <Check className="size-3.5 text-accent" />}
              </MenuItem>
            ))}
            {!refs.length && <div className="px-2 py-2 text-[12px] text-fg-4">붙인 레퍼런스가 없어요</div>}
            <MenuSeparator />
            <MenuItem onSelect={() => onRelink(null)}>
              <Unlink /> 연결하지 않음 (그대로 두기)
            </MenuItem>
          </MenuContent>
        </Menu>

        <ArrowRight className={cn("size-3.5", changes ? "text-accent" : "text-fg-4")} />

        {/* 정리 후 + 상태 */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className={cn("truncate font-mono text-[12.5px]", changes ? "text-accent" : "text-fg-3")}>{target ?? group.label}</span>
          <span className={cn("flex shrink-0 items-center gap-1 text-[11px]", st.tone)} title={group.reason}>
            <StIcon className="size-3.5" /> {st.label}
          </span>
        </div>
      </div>
      {(group.status === "missing" || group.status === "guessed") && <p className="px-3 pt-0.5 text-[11px] text-fg-4">{group.reason}</p>}
    </motion.li>
  );
}

/**
 * 지금 쓰는 표기 그대로 번호만 바꾸기: @img8 → @img3, [Image 2] → [Image 3], @jacket → (모델 형식 없이) @img3
 */
function sameStyle(label: string, r: MentionRef): string {
  const m = label.match(/^(.*?)(\d+)(\W*)$/u);
  if (m && m[1]) return `${m[1]}${r.order}${m[3]}`;
  return `@${r.kind === "video" ? "vid" : r.kind === "audio" ? "audio" : "img"}${r.order}`;
}

function Thumb({ r, className }: { r: MentionRef; className?: string }) {
  return (
    <span className={cn("relative shrink-0 overflow-hidden rounded-md bg-panel-3", className)}>
      {/* 서명된 원본 URL을 그대로 씀 (이미지 최적화 비용 없음) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {r.thumb ? <img src={r.thumb} alt="" className="size-full object-cover" /> : null}
      {r.kind === "video" && <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-0.5 font-mono text-[8px] text-white">VID</span>}
    </span>
  );
}

function Hint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 p-4">
      <span className="flex size-8 items-center justify-center rounded-lg bg-panel-2 text-fg-3">
        <AtSign className="size-4" />
      </span>
      <p className="text-[13.5px] font-medium">{title}</p>
      <p className="text-[12.5px] leading-relaxed text-fg-3">{desc}</p>
    </div>
  );
}
