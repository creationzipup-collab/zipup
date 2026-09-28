"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookText, Globe, Lock, Search, Users } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { getModel } from "@/lib/models/registry";
import type { Visibility } from "@/lib/types";
import { fetchJson } from "@/lib/utils";

export type PromptPreset = {
  id: string;
  title: string;
  prompt: string;
  kind: "image" | "video" | "any";
  modelId: string | null;
  params: Record<string, unknown> | null;
  tags: string[];
  visibility: Visibility;
  useCount: number;
  latestVersion: number;
  author: string;
  mine: boolean;
  updatedAt: string;
};

export const VIS_ICON: Record<Visibility, React.ElementType> = { private: Lock, team: Users, company: Globe };

export function usePrompts(opts: { scope: string; q: string; kind?: string }) {
  return useQuery({
    queryKey: ["prompts", opts],
    queryFn: () => {
      const p = new URLSearchParams({ scope: opts.scope, q: opts.q });
      if (opts.kind) p.set("kind", opts.kind);
      return fetchJson<{ items: PromptPreset[] }>(`/api/prompts?${p}`).then((r) => r.items);
    },
  });
}

export function PromptLibraryDialog({
  open,
  onOpenChange,
  kind,
  onUse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "image" | "video";
  onUse: (p: PromptPreset) => void;
}) {
  const [scope, setScope] = React.useState("all");
  const [q, setQ] = React.useState("");
  const { data = [], isLoading } = usePrompts({ scope, q, kind });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title="프롬프트 라이브러리" description="팀이 저장한 프롬프트를 불러와요.">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목, 내용, 태그 검색"
              className="h-9 w-full rounded-[10px] border border-line-2 bg-panel-2/70 pl-9 pr-3 text-sm outline-none focus:border-fg-3"
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
        </div>
        <div className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto p-3 scrollbar-thin">
          {isLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
          {!isLoading && !data.length && <EmptyState icon={<BookText />} title="저장된 프롬프트가 없어요" description="스튜디오에서 🔖 버튼으로 자주 쓰는 프롬프트를 저장해 보세요." />}
          {data.map((p) => {
            const Icon = VIS_ICON[p.visibility];
            return (
              <button
                key={p.id}
                onClick={() => {
                  onUse(p);
                  onOpenChange(false);
                  void fetchJson(`/api/prompts/${p.id}`, { method: "PATCH", body: JSON.stringify({ used: true }) }).catch(() => {});
                }}
                className="flex flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition hover:bg-panel-2"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[13.5px] font-medium">{p.title}</span>
                  <Icon className="size-3 text-fg-4" />
                  {p.modelId && <span className="rounded bg-panel-3 px-1.5 py-0.5 text-[10px] text-fg-3">{getModel(p.modelId)?.shortName ?? p.modelId}</span>}
                  <span className="ml-auto text-[11px] text-fg-4">
                    {p.author} · {p.useCount}회
                  </span>
                </span>
                <span className="line-clamp-2 text-[12.5px] text-fg-3">{p.prompt}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SavePromptDialog({
  open,
  onOpenChange,
  prompt,
  kind,
  modelId,
  params,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prompt: string;
  kind: "image" | "video";
  modelId?: string;
  params?: Record<string, unknown>;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState(prompt);
  const [tags, setTags] = React.useState("");
  const [visibility, setVisibility] = React.useState<Visibility>("team");
  const [withSettings, setWithSettings] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setText(prompt);
      setTitle(prompt.slice(0, 30));
    }
  }
  async function save() {
    setLoading(true);
    try {
      await fetchJson("/api/prompts", {
        method: "POST",
        body: JSON.stringify({
          title,
          prompt: text,
          kind,
          modelId: withSettings ? modelId : null,
          params: withSettings ? params : null,
          tags: tags.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
          visibility,
        }),
      });
      void qc.invalidateQueries({ queryKey: ["prompts"] });
      toast.success("프롬프트를 저장했어요.");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="프롬프트 저장">
        <DialogBody className="flex flex-col gap-4">
          <Field label="제목">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </Field>
          <Field label="프롬프트">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} />
          </Field>
          <Field label="태그" hint="쉼표나 공백으로 구분">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="광고, 제품, 시네마틱" />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: "private", label: "나만" },
                { value: "team", label: "우리 팀" },
                { value: "company", label: "전사" },
              ]}
            />
            <label className="flex items-center gap-2 text-[12.5px] text-fg-2">
              <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} className="accent-[var(--accent)]" />
              모델·설정도 함께 저장
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="primary" loading={loading} disabled={!title.trim() || !text.trim()} onClick={save}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
