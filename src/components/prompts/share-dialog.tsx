"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe, Search, Send, Users, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useShellMaybe } from "@/components/shell/app-shell";
import { useDirectory } from "@/components/projects/project-dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { cn, fetchJson } from "@/lib/utils";

type Clip = { id: string; kind: "image" | "video"; thumb: string; src: string };
type Person = { id: string; name: string; image: string | null; teamName: string | null };

/**
 * 프롬프트 보내기 — 사람(여러 명)·우리 팀·전사. 받은 사람에게 알림이 가고, 메시지는 그 프롬프트 대화의 첫 줄이 돼요.
 * 클립에서 열면 그 클립이 함께 가고, 저장한 프롬프트에서 열면 그 프롬프트로 나온 클립 중에서 골라요.
 */
export function ShareDialog({
  open,
  onOpenChange,
  assetId,
  presetId,
  defaultTitle = "",
  preview,
  onSent,
  askTitle = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 클립에서 보낼 때 */
  assetId?: string | null;
  /** 저장한 프롬프트를 보낼 때 */
  presetId?: string | null;
  defaultTitle?: string;
  preview?: { thumb: string; kind: "image" | "video"; prompt?: string } | null;
  onSent?: (presetId: string) => void;
  /** 저장한 프롬프트를 보낼 때도 제목을 물어요 (스튜디오의 컷 작업 기록에서 보낼 때) */
  askTitle?: boolean;
}) {
  const qc = useQueryClient();
  const shell = useShellMaybe();
  const me = shell?.user;
  const [title, setTitle] = React.useState(defaultTitle);
  const [message, setMessage] = React.useState("");
  const [people, setPeople] = React.useState<Person[]>([]);
  const [team, setTeam] = React.useState(false);
  const [company, setCompany] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [pick, setPick] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setTitle(defaultTitle);
      setMessage("");
      setPeople([]);
      setTeam(false);
      setCompany(false);
      setQ("");
      setPick(null);
    }
  }

  const dq = React.useDeferredValue(q.trim());
  const dir = useDirectory(dq, open);
  const found = (dir.data?.people ?? []).filter((p) => p.id !== me?.id && !people.some((x) => x.id === p.id)).slice(0, 6);

  const clips = useQuery({
    queryKey: ["prompt-clips", presetId],
    queryFn: () => fetchJson<{ items: Clip[] }>(`/api/prompts/${presetId}/clips`).then((r) => r.items),
    enabled: open && !!presetId && !assetId,
  });

  const ready = people.length > 0 || team || company;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      const r = await fetchJson<{ presetId: string; sent: number }>("/api/prompts/share", {
        method: "POST",
        body: JSON.stringify({
          presetId: presetId ?? null,
          assetId: assetId ?? pick ?? null,
          title: title.trim() || null,
          message: message.trim() || null,
          to: { users: people.map((p) => p.id), team, company },
        }),
      });
      const names = [...people.map((p) => p.name), ...(team ? [me?.teamName ?? "우리 팀"] : []), ...(company ? ["전사"] : [])];
      toast.success(`${names.slice(0, 3).join(", ")}${names.length > 3 ? ` 외 ${names.length - 3}` : ""}에게 보냈어요.`, {
        description: "받은 사람에게 알림이 갔어요. 대화는 프롬프트 라이브러리에서 이어져요.",
      });
      void qc.invalidateQueries({ queryKey: ["prompt-library"] });
      onSent?.(r.presetId);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="프롬프트 보내기" description="사람이나 팀을 고르면 알림이 가고, 받은 사람의 라이브러리 ‘받은’에 들어가요." size="md">
        <DialogBody className="flex flex-col gap-4">
          {preview && (
            <div className="flex gap-3 rounded-xl border border-line bg-white/[0.02] p-2.5">
              {preview.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.thumb} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <video src={`${preview.thumb}#t=0.1`} muted className="size-16 shrink-0 rounded-lg object-cover" />
              )}
              {preview.prompt && <p className="line-clamp-3 text-[12.5px] leading-relaxed text-fg-3">{preview.prompt}</p>}
            </div>
          )}

          {/* 받는 사람 */}
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-fg-2">받는 사람</span>
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip on={team} onClick={() => setTeam((v) => !v)} disabled={!!me && !me.teamName}>
                <Users className="size-3.5" /> {me ? (me.teamName ?? "소속 팀 없음") : "우리 팀"}
              </ToggleChip>
              <ToggleChip on={company} onClick={() => setCompany((v) => !v)}>
                <Globe className="size-3.5" /> 전사
              </ToggleChip>
              {people.map((p) => (
                <span key={p.id} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 pl-1 pr-1.5 text-[12.5px] text-fg">
                  <Avatar name={p.name} image={p.image} size={22} />
                  {p.name}
                  <button type="button" onClick={() => setPeople((l) => l.filter((x) => x.id !== p.id))} className="rounded-full p-0.5 text-fg-3 hover:bg-white/10 hover:text-fg" aria-label={`${p.name} 빼기`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·이메일로 사람 찾기" className="h-9 pl-9" />
            </div>
            {found.length > 0 && (q || people.length === 0) && (
              <div className="flex flex-wrap gap-1.5">
                {found.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPeople((l) => [...l, p]);
                      setQ("");
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-2 pl-1 pr-3 text-[12.5px] text-fg-2 transition hover:border-line-3 hover:text-fg"
                  >
                    <Avatar name={p.name} image={p.image} size={22} />
                    {p.name}
                    {p.teamName && <span className="text-[11px] text-fg-4">{p.teamName}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Field label="같이 보낼 말" hint="대화의 첫 메시지가 돼요">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} autoGrow maxRows={5} maxLength={500} placeholder="예: C014 톤이 이거랑 비슷하게 가면 좋겠어요" />
          </Field>

          {(!presetId || askTitle) && (
            <Field label="제목" hint="비워 두면 프롬프트 앞부분으로 지어요">
              <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="예: 비 오는 골목 · 35mm 무드" />
            </Field>
          )}

          {presetId && !assetId && (
            <div className="flex flex-col gap-2">
              <span className="text-[12.5px] font-medium text-fg-2">함께 보낼 클립 — 이 프롬프트로 나온 것</span>
              {clips.isLoading ? (
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="skeleton size-14 rounded-lg" />
                  ))}
                </div>
              ) : clips.data?.length ? (
                <div className="flex flex-wrap gap-2">
                  {clips.data.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPick((p) => (p === c.id ? null : c.id))}
                      className={cn("relative size-14 overflow-hidden rounded-lg ring-offset-2 ring-offset-bg transition", pick === c.id ? "ring-2 ring-accent" : "opacity-75 hover:opacity-100")}
                    >
                      {c.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumb} alt="" className="size-full object-cover" />
                      ) : (
                        <video src={`${c.src}#t=0.1`} muted className="size-full object-cover" />
                      )}
                      {pick === c.id && (
                        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-accent text-on-accent">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-fg-4">아직 이 프롬프트로 나온 클립이 없어요. 글만 가요.</p>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="accent" loading={busy} disabled={!ready} onClick={() => void submit()}>
            <Send /> 보내기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleChip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition disabled:opacity-40",
        on ? "border-accent/50 bg-accent/12 text-fg shadow-[0_0_14px_-6px_var(--accent-glow)]" : "border-line-2 text-fg-2 hover:border-line-3 hover:text-fg",
      )}
    >
      {on && <Check className="size-3.5 text-accent" />}
      {children}
    </button>
  );
}
