"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BookText, Clapperboard, Copy, ImagePlus, MoreHorizontal, Pencil, Plus, Search, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { type PromptPreset, usePrompts, VIS_ICON } from "@/components/prompts/prompt-dialogs";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { EmptyState, TimeAgo } from "@/components/ui/misc";
import { getModel } from "@/lib/models/registry";
import { type Visibility, VISIBILITY_LABEL } from "@/lib/types";
import { fetchJson } from "@/lib/utils";

type Kind = "image" | "video" | "any";
type Draft = { id?: string; title: string; prompt: string; tags: string; visibility: Visibility; kind: Kind };

const KIND_LABEL: Record<Kind, string> = { image: "이미지", video: "영상", any: "공용" };

export function PromptsView({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [scope, setScope] = React.useState("all");
  const [kind, setKind] = React.useState<"all" | "image" | "video">("all");
  const [q, setQ] = React.useState("");
  const dq = React.useDeferredValue(q.trim());
  const { data = [], isLoading } = usePrompts({ scope, q: dq, kind: kind === "all" ? undefined : kind });
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function remove(p: PromptPreset) {
    if (!(await confirm({ title: `‘${p.title}’을(를) 삭제할까요?`, confirmLabel: "삭제", danger: true }))) return;
    try {
      await fetchJson(`/api/prompts/${p.id}`, { method: "DELETE" });
      toast.success("삭제했어요.");
      void qc.invalidateQueries({ queryKey: ["prompts"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">프롬프트</h1>
          <p className="mt-1 text-sm text-fg-3">잘 나온 프롬프트를 모델·설정과 함께 저장하고 팀과 나눠 써요.</p>
        </div>
        <Button variant="primary" onClick={() => setDraft({ title: "", prompt: "", tags: "", visibility: "team", kind: "any" })}>
          <Plus /> 새 프롬프트
        </Button>
      </div>

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
            { value: "mine", label: "내 것" },
          ]}
        />
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "모든 종류" },
            { value: "image", label: "이미지" },
            { value: "video", label: "영상" },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<BookText />}
          title={dq ? "검색 결과가 없어요" : "저장된 프롬프트가 없어요"}
          description={dq ? "다른 단어로 찾아보세요. 태그도 함께 검색돼요." : "스튜디오에서 🔖 버튼을 누르거나, 여기서 바로 만들어 보세요."}
          action={
            !dq && (
              <Button variant="primary" onClick={() => setDraft({ title: "", prompt: "", tags: "", visibility: "team", kind: "any" })}>
                <Plus /> 새 프롬프트
              </Button>
            )
          }
        />
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 xl:columns-3 2xl:columns-4">
          {data.map((p) => (
            <PromptCard
              key={p.id}
              p={p}
              canEdit={p.mine || isAdmin}
              onEdit={() => setDraft({ id: p.id, title: p.title, prompt: p.prompt, tags: p.tags.join(", "), visibility: p.visibility, kind: p.kind })}
              onDelete={() => remove(p)}
            />
          ))}
        </div>
      )}

      <PromptEditor draft={draft} onClose={() => setDraft(null)} />
      {confirmDialog}
    </div>
  );
}

function PromptCard({ p, canEdit, onEdit, onDelete }: { p: PromptPreset; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const VisIcon = VIS_ICON[p.visibility];
  const model = p.modelId ? getModel(p.modelId) : null;
  const targets: ("image" | "video")[] = p.kind === "any" ? ["image", "video"] : [p.kind];

  return (
    <article className="group mb-3 flex break-inside-avoid flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition hover:border-line-2">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/prompts/${p.id}`} className="group/title flex items-center gap-2">
            <h3 className="truncate text-[14.5px] font-semibold group-hover/title:underline group-hover/title:underline-offset-4">{p.title}</h3>
            {p.latestVersion > 1 && <span className="shrink-0 rounded-md bg-panel-3 px-1.5 py-0.5 font-mono text-[10.5px] text-fg-3">v{p.latestVersion}</span>}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-4">
            <span className="rounded bg-panel-3 px-1.5 py-0.5 text-fg-3">{KIND_LABEL[p.kind]}</span>
            {model && (
              <span className="rounded bg-panel-3 px-1.5 py-0.5 text-fg-3" title="모델·설정이 함께 저장돼 있어요">
                {model.shortName}
                {p.params ? " · 설정 포함" : ""}
              </span>
            )}
            <span className="flex items-center gap-1" title={VISIBILITY_LABEL[p.visibility]}>
              <VisIcon className="size-3" /> {VISIBILITY_LABEL[p.visibility]}
            </span>
          </div>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="더보기" className="opacity-60 group-hover:opacity-100">
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
            {canEdit && (
              <>
                <MenuItem onSelect={onEdit}>
                  <Pencil /> 편집
                </MenuItem>
                <MenuSeparator />
                <MenuItem danger onSelect={onDelete}>
                  <Trash2 /> 삭제
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </header>

      <p className="line-clamp-6 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{p.prompt}</p>

      {p.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.tags.map((t) => (
            <span key={t} className="rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-fg-3">
              #{t}
            </span>
          ))}
        </div>
      )}

      <footer className="flex items-center gap-2 border-t border-line pt-3">
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-4">
          {p.author} · {p.useCount.toLocaleString()}회 사용 · <TimeAgo date={p.updatedAt} />
        </span>
        {targets.map((k) => (
          <Button key={k} asChild variant={targets.length === 1 ? "secondary" : "ghost"} size="xs">
            <Link href={`/create/${k}?preset=${p.id}`}>
              {k === "image" ? <ImagePlus /> : <Clapperboard />}
              {targets.length === 1 ? "사용" : KIND_LABEL[k]}
            </Link>
          </Button>
        ))}
      </footer>
    </article>
  );
}

function PromptEditor({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = React.useState<Draft | null>(draft);
  const [saving, setSaving] = React.useState(false);
  const [prevDraft, setPrevDraft] = React.useState(draft);
  if (prevDraft !== draft) {
    setPrevDraft(draft);
    setD(draft);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d || !d.title.trim() || !d.prompt.trim()) return;
    setSaving(true);
    try {
      const body = {
        title: d.title.trim(),
        prompt: d.prompt.trim(),
        kind: d.kind,
        visibility: d.visibility,
        tags: d.tags
          .split(/[,\s]+/)
          .map((t) => t.replace(/^#/, "").trim())
          .filter(Boolean)
          .slice(0, 10),
      };
      await fetchJson(d.id ? `/api/prompts/${d.id}` : "/api/prompts", { method: d.id ? "PATCH" : "POST", body: JSON.stringify(body) });
      toast.success(d.id ? "저장했어요." : "프롬프트를 추가했어요.");
      void qc.invalidateQueries({ queryKey: ["prompts"] });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={draft?.id ? "프롬프트 편집" : "새 프롬프트"} size="md">
        {d && (
          <form onSubmit={save}>
            <DialogBody className="flex flex-col gap-4">
              <Field label="제목">
                <Input autoFocus value={d.title} maxLength={80} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="예: 제품 누끼 · 스튜디오 조명" />
              </Field>
              <Field label="프롬프트">
                <Textarea value={d.prompt} maxLength={5000} rows={6} autoGrow onChange={(e) => setD({ ...d, prompt: e.target.value })} placeholder="자세히 적을수록 결과가 좋아요." />
              </Field>
              <Field label="태그" hint="쉼표나 공백으로 구분해요. 검색에 쓰여요.">
                <Input value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} placeholder="광고, 제품, 시네마틱" />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Segmented
                  value={d.kind}
                  onChange={(k) => setD({ ...d, kind: k })}
                  options={[
                    { value: "any", label: "공용" },
                    { value: "image", label: "이미지" },
                    { value: "video", label: "영상" },
                  ]}
                />
                <Segmented
                  value={d.visibility}
                  onChange={(v) => setD({ ...d, visibility: v })}
                  options={[
                    { value: "private", label: "나만" },
                    { value: "team", label: "우리 팀" },
                    { value: "company", label: "전사" },
                  ]}
                />
              </div>
              {!d.id && (
                <p className="flex items-center gap-1.5 text-[12px] text-fg-4">
                  <Wand2 className="size-3.5" /> 모델과 세부 설정까지 저장하려면 스튜디오에서 🔖 버튼으로 저장하세요.
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                취소
              </Button>
              <Button type="submit" variant="primary" loading={saving} disabled={!d.title.trim() || !d.prompt.trim()}>
                저장
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

