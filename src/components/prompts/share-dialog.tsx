"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe, Users } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { cn, fetchJson } from "@/lib/utils";

type Clip = { id: string; kind: "image" | "video"; thumb: string; src: string };

/**
 * 프롬프트 공유 — 게시판에는 이렇게 직접 공유한 것만 올라가요.
 * 클립에서 열면 그 클립이 썸네일이 되고, 저장한 프롬프트에서 열면 그 프롬프트로 나온 클립 중에서 골라요.
 */
export function ShareDialog({
  open,
  onOpenChange,
  assetId,
  presetId,
  defaultTitle = "",
  preview,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 클립에서 공유할 때 */
  assetId?: string | null;
  /** 저장한 프롬프트를 올릴 때 */
  presetId?: string | null;
  defaultTitle?: string;
  preview?: { thumb: string; kind: "image" | "video"; prompt?: string } | null;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState(defaultTitle);
  const [scope, setScope] = React.useState<"team" | "company">("team");
  const [pick, setPick] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setTitle(defaultTitle);
      setPick(null);
    }
  }

  const clips = useQuery({
    queryKey: ["prompt-clips", presetId],
    queryFn: () => fetchJson<{ items: Clip[] }>(`/api/prompts/${presetId}/clips`).then((r) => r.items),
    enabled: open && !!presetId && !assetId,
  });

  async function submit() {
    setBusy(true);
    try {
      const body = { title: title.trim() || null, visibility: scope, ...(assetId ? { assetId } : pick ? { assetId: pick } : {}) };
      await fetchJson(presetId ? `/api/prompts/${presetId}/share` : "/api/prompts/share", { method: "POST", body: JSON.stringify(body) });
      toast.success(scope === "team" ? "팀 프롬프트에 올렸어요." : "전사 프롬프트에 올렸어요.");
      void qc.invalidateQueries({ queryKey: ["prompts"] });
      void qc.invalidateQueries({ queryKey: ["prompt-board"] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="프롬프트 공유" description="저장만 한 프롬프트는 게시판에 올라가지 않아요. 여기서 공유한 것만 올라가요." size="md">
        <DialogBody className="flex flex-col gap-4">
          {preview && (
            <div className="flex gap-3 rounded-xl border border-line bg-panel-2/50 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview.kind === "image" ? <img src={preview.thumb} alt="" className="size-16 shrink-0 rounded-lg object-cover" /> : <video src={`${preview.thumb}#t=0.1`} muted className="size-16 shrink-0 rounded-lg object-cover" />}
              {preview.prompt && <p className="line-clamp-3 text-[12.5px] leading-relaxed text-fg-3">{preview.prompt}</p>}
            </div>
          )}
          <Field label="제목" hint="비워 두면 프롬프트 앞부분으로 지어요">
            <Input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="예: 비 오는 골목 · 35mm 무드" />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-fg-2">누구에게</span>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: "team", label: <span className="flex items-center gap-1.5"><Users className="size-3.5" /> 우리 팀</span> },
                { value: "company", label: <span className="flex items-center gap-1.5"><Globe className="size-3.5" /> 전사</span> },
              ]}
            />
          </div>
          {presetId && !assetId && (
            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] font-medium text-fg-2">썸네일 — 이 프롬프트로 나온 클립</span>
              {clips.isLoading ? (
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="skeleton size-16 rounded-lg" />
                  ))}
                </div>
              ) : clips.data?.length ? (
                <div className="flex flex-wrap gap-2">
                  {clips.data.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPick((p) => (p === c.id ? null : c.id))}
                      className={cn("relative size-16 overflow-hidden rounded-lg ring-offset-2 ring-offset-elevated transition", pick === c.id ? "ring-2 ring-fg" : "opacity-80 hover:opacity-100")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.kind === "image" ? <img src={c.thumb} alt="" className="size-full object-cover" /> : <video src={`${c.src}#t=0.1`} muted className="size-full object-cover" />}
                      {pick === c.id && (
                        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded bg-inv text-inv-fg">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-fg-4">아직 이 프롬프트로 나온 클립이 없어요. 글만 올라가요.</p>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            공유
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
