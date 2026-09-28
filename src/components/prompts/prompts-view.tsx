"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { PageTitle } from "@/components/brand/page-title";
import { PromptLibrary, type LibraryTab } from "@/components/prompts/library";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { fetchJson } from "@/lib/utils";

type Kind = "image" | "video" | "any";

/** 프롬프트 라이브러리 (전체 화면) — 스튜디오의 라이브러리와 같은 곳이에요 */
export function PromptsView({ isAdmin, initialTab, initialOpen }: { isAdmin: boolean; initialTab: LibraryTab; initialOpen: string | null }) {
  const qc = useQueryClient();
  const [writing, setWriting] = React.useState(false);
  return (
    <div className="mx-auto flex h-[calc(100dvh-56px)] w-full max-w-[1600px] flex-col gap-5 px-4 pt-6 sm:px-8 sm:pt-8">
      <PageTitle
        label="Prompt library"
        title="프롬프트 라이브러리"
        subtitle="저장한 것, 받은 것, 팀에 공유된 것, 내가 보낸 것이 여기 한곳에 있어요. 스튜디오의 ‘라이브러리’와 같은 곳이에요."
        actions={
          <Button variant="secondary" onClick={() => setWriting(true)}>
            <Plus /> 새 프롬프트
          </Button>
        }
      />
      <PromptLibrary mode="page" isAdmin={isAdmin} initialTab={initialTab} initialOpen={initialOpen} className="min-h-0 flex-1 pb-4" />
      <WriteDialog open={writing} onOpenChange={setWriting} onDone={() => void qc.invalidateQueries({ queryKey: ["prompt-library"] })} />
    </div>
  );
}

/** 글로 바로 저장 (보내기는 저장한 뒤 오른쪽 패널에서) */
function WriteDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [title, setTitle] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [kind, setKind] = React.useState<Kind>("any");
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
          tags: tags
            .split(/[,\s]+/)
            .map((t) => t.replace(/^#/, "").trim())
            .filter(Boolean)
            .slice(0, 10),
        }),
      });
      toast.success("라이브러리에 저장했어요.", { description: "오른쪽 패널의 ‘보내기’로 동료나 팀에 보낼 수 있어요." });
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
      <DialogContent title="새 프롬프트" description="라이브러리 ‘저장’에 들어가요." size="md">
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
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: "any", label: "공용" },
                { value: "image", label: "이미지" },
                { value: "video", label: "영상" },
              ]}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!title.trim() || !prompt.trim()}>
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
