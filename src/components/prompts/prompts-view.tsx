"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Clapperboard, Copy, EyeOff, ImagePlus, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { MediaThumb } from "@/components/assets/media";
import { VerdictBadge } from "@/components/assets/selection-controls";
import { PageTitle } from "@/components/brand/page-title";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { EmptyState, TimeAgo } from "@/components/ui/misc";
import { getModel } from "@/lib/models/registry";
import type { SharedPromptDTO } from "@/lib/services/prompt-docs";
import { cn, fetchJson } from "@/lib/utils";

type Kind = "image" | "video" | "any";

function useBoard(opts: { scope: string; q: string; kind?: string }) {
  return useQuery({
    queryKey: ["prompt-board", opts],
    queryFn: () => {
      const p = new URLSearchParams({ board: "1", scope: opts.scope, q: opts.q });
      if (opts.kind) p.set("kind", opts.kind);
      return fetchJson<{ items: SharedPromptDTO[] }>(`/api/prompts?${p}`).then((r) => r.items);
    },
  });
}

/** 프롬프트 게시판 — 누가 직접 "공유"한 것만 올라와요. 어떤 클립에서 나왔는지 썸네일과 함께. */
export function PromptsView({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [scope, setScope] = React.useState("all");
  const [kind, setKind] = React.useState<"all" | "image" | "video">("all");
  const [q, setQ] = React.useState("");
  const dq = React.useDeferredValue(q.trim());
  const { data = [], isLoading } = useBoard({ scope, q: dq, kind: kind === "all" ? undefined : kind });
  const [writing, setWriting] = React.useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["prompt-board"] });
    void qc.invalidateQueries({ queryKey: ["prompts"] });
  };

  async function unshare(p: SharedPromptDTO) {
    try {
      await fetchJson(`/api/prompts/${p.id}/share`, { method: "DELETE" });
      toast.success("게시판에서 내렸어요. 저장한 프롬프트는 그대로 있어요.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(p: SharedPromptDTO) {
    if (!(await confirm({ title: `‘${p.title}’을(를) 지울까요?`, description: "버전 기록도 함께 지워져요.", confirmLabel: "삭제", danger: true }))) return;
    try {
      await fetchJson(`/api/prompts/${p.id}`, { method: "DELETE" });
      toast.success("지웠어요.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageTitle
        label="Prompts"
        title="프롬프트"
        subtitle="팀원이 직접 공유한 프롬프트만 모여요. 결과 클립에서 '공유'를 누르면 그 클립과 함께 올라와요."
        actions={
          <Button variant="secondary" onClick={() => setWriting(true)}>
            <Plus /> 글로 올리기
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목, 내용, 태그 검색"
            className="h-9 w-full rounded-[10px] border border-line-2 bg-panel/80 pl-9 pr-3 text-sm outline-none focus:border-fg-3"
          />
        </div>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "전체" },
            { value: "team", label: "우리 팀" },
            { value: "mine", label: "내가 올린 것" },
          ]}
        />
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "모두" },
            { value: "image", label: "이미지" },
            { value: "video", label: "영상" },
          ]}
        />
        <span className="ml-auto font-mono text-[11px] text-fg-4">{data.length}개</span>
      </div>

      {isLoading ? (
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton mb-4 rounded-2xl" style={{ height: 180 + (i % 3) * 70 }} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title={dq ? "검색 결과가 없어요" : "아직 공유된 프롬프트가 없어요"}
          description={dq ? "다른 단어로 찾아보세요. 태그도 함께 검색돼요." : "스튜디오 결과 클립에 마우스를 올리고 '공유'를 누르면 여기에 그 클립과 함께 올라와요."}
        />
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
          {data.map((p, i) => (
            <SharedCard key={p.id} p={p} index={i} canManage={p.mine || isAdmin} onUnshare={() => unshare(p)} onDelete={() => remove(p)} />
          ))}
        </div>
      )}

      <WriteDialog open={writing} onOpenChange={setWriting} onDone={refresh} />
      {confirmDialog}
    </div>
  );
}

function SharedCard({ p, index, canManage, onUnshare, onDelete }: { p: SharedPromptDTO; index: number; canManage: boolean; onUnshare: () => void; onDelete: () => void }) {
  const model = p.modelId ? getModel(p.modelId) : null;
  const targets: ("image" | "video")[] = p.kind === "any" ? ["image", "video"] : [p.kind];
  const s = p.source;
  const ratio = s?.width && s?.height ? Math.max(0.8, Math.min(1.9, s.width / s.height)) : 16 / 9;
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -5% 0px" }}
      transition={{ duration: 0.5, delay: Math.min(index, 8) * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
      className="group mb-4 flex break-inside-avoid flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-2"
    >
      {s && (
        <Link href={`/library?asset=${s.assetId}`} className="relative block overflow-hidden bg-panel-3" style={{ aspectRatio: String(ratio) }} title="원본 클립 열기">
          <MediaThumb kind={s.kind} thumb={s.thumb} src={s.src} durationSec={s.durationSec} className="transition duration-700 group-hover:scale-[1.03]" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8">
            <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-white/80">
              {s.projectName}
              {s.cutCode ? ` / ${s.cutCode}` : ""}
              {s.take ? ` · T${String(s.take).padStart(2, "0")}` : ""}
            </span>
            <VerdictBadge flag={s.flag} className="ml-auto shrink-0" />
          </span>
        </Link>
      )}
      <div className="flex flex-col gap-3 p-4">
        <header className="flex items-start gap-2">
          <Link href={`/prompts/${p.id}`} className="min-w-0 flex-1">
            <h3 className="truncate text-[14.5px] font-semibold hover:underline hover:underline-offset-4">{p.title}</h3>
          </Link>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="더보기" className="-mr-1 opacity-60 group-hover:opacity-100">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                onSelect={async () => {
                  await navigator.clipboard.writeText(p.prompt);
                  toast.success("프롬프트를 복사했어요.");
                }}
              >
                <Copy /> 복사
              </MenuItem>
              <MenuItem asChild>
                <Link href={`/prompts/${p.id}`}>
                  <ArrowUpRight /> 버전 기록
                </Link>
              </MenuItem>
              {canManage && (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={onUnshare}>
                    <EyeOff /> 게시판에서 내리기
                  </MenuItem>
                  <MenuItem danger onSelect={onDelete}>
                    <Trash2 /> 삭제
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </header>

        <p className="line-clamp-5 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{p.prompt}</p>

        <div className="flex flex-wrap gap-1">
          {model && (
            <span className="rounded-md bg-panel-3 px-1.5 py-0.5 text-[11px] text-fg-3" title={p.params ? "모델·설정이 함께 저장돼 있어요" : undefined}>
              {model.shortName}
              {p.params ? " · 설정 포함" : ""}
            </span>
          )}
          {p.latestVersion > 1 && <span className="rounded-md bg-panel-3 px-1.5 py-0.5 font-mono text-[10.5px] text-fg-3">v{p.latestVersion}</span>}
          {p.tags.map((t) => (
            <span key={t} className="rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-fg-3">
              #{t}
            </span>
          ))}
        </div>

        <footer className="flex items-center gap-2 border-t border-line pt-3">
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-4">
            {p.sharedBy ?? p.author} · <TimeAgo date={p.sharedAt} />
            {p.useCount > 0 && ` · ${p.useCount}회 사용`}
          </span>
          {targets.map((k) => (
            <Button key={k} asChild variant={targets.length === 1 ? "secondary" : "ghost"} size="xs">
              <Link href={`/create/${k}?preset=${p.id}`}>
                {k === "image" ? <ImagePlus /> : <Clapperboard />}
                {targets.length === 1 ? "사용" : k === "image" ? "이미지" : "영상"}
              </Link>
            </Button>
          ))}
        </footer>
      </div>
    </motion.article>
  );
}

/** 클립 없이 글로 바로 올리기 */
function WriteDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [title, setTitle] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [kind, setKind] = React.useState<Kind>("any");
  const [scope, setScope] = React.useState<"team" | "company">("team");
  const [saving, setSaving] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;
    setSaving(true);
    try {
      await fetchJson("/api/prompts", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          prompt: prompt.trim(),
          kind,
          visibility: scope,
          shared: true,
          tags: tags
            .split(/[,\s]+/)
            .map((t) => t.replace(/^#/, "").trim())
            .filter(Boolean)
            .slice(0, 10),
        }),
      });
      toast.success("게시판에 올렸어요.");
      onDone();
      onOpenChange(false);
      setTitle("");
      setPrompt("");
      setTags("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="글로 올리기" description="썸네일과 함께 올리려면 스튜디오 결과 클립에서 '공유'를 누르세요." size="md">
        <form onSubmit={save}>
          <DialogBody className="flex flex-col gap-4">
            <Field label="제목">
              <Input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="예: 제품 누끼 · 스튜디오 조명" />
            </Field>
            <Field label="프롬프트">
              <Textarea value={prompt} maxLength={5000} rows={6} autoGrow onChange={(e) => setPrompt(e.target.value)} />
            </Field>
            <Field label="태그" hint="쉼표나 공백으로 구분해요">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="광고, 제품, 시네마틱" />
            </Field>
            <div className={cn("flex flex-wrap items-center justify-between gap-3")}>
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: "any", label: "공용" },
                  { value: "image", label: "이미지" },
                  { value: "video", label: "영상" },
                ]}
              />
              <Segmented
                value={scope}
                onChange={setScope}
                options={[
                  { value: "team", label: "우리 팀" },
                  { value: "company", label: "전사" },
                ]}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!title.trim() || !prompt.trim()}>
              올리기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
