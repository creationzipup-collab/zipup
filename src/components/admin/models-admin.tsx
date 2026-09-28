"use client";

import { ChevronDown, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { ModelSwatch } from "@/components/studio/model-picker";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import type { PriceItem } from "@/lib/models/types";
import { cn, fetchJson, usd } from "@/lib/utils";

export type AdminModelItem = {
  id: string;
  name: string;
  vendor: string;
  kind: "image" | "video";
  provider: "higgsfield" | "fal";
  tagline: string;
  gradient: string;
  prices: PriceItem[];
  priceNote: string | null;
  supportsDraft: boolean;
  resolved: "higgsfield" | "fal" | "mock" | null;
  draftResolved: "higgsfield" | "fal" | "mock" | null;
  providers: { id: "higgsfield" | "fal"; configured: boolean }[];
  config: { enabled: boolean; priceOverrides: Record<string, number>; notes: string | null; provider: "higgsfield" | "fal" | null };
  usage: { count: number; spend: number; failed: number };
};

export function ModelsAdmin({ items }: { items: AdminModelItem[] }) {
  const groups = [
    { title: "이미지 모델", list: items.filter((m) => m.kind === "image") },
    { title: "영상 모델", list: items.filter((m) => m.kind === "video") },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3 rounded-2xl border border-line bg-panel/60 p-4 text-[12.5px] leading-relaxed text-fg-3">
        <Info className="mt-0.5 size-4 shrink-0 text-fg-4" />
        <p>
          <b className="font-medium text-fg-2">예상 금액 계산 방식</b> — Higgsfield 모델은 제출 직전 Higgsfield 견적 API 금액을 먼저 쓰고, 실패하면 아래 단가표로 계산해요. fal.ai 모델은
          단가표로 계산해요. 예산 한도는 이 금액 기준이며, 실제 청구 금액은 각 공급자 콘솔에서 확인해 주세요. 가격이 바뀌면 기본값 대신 새 단가를 입력하세요.
        </p>
      </div>
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-2.5">
          <h2 className="text-[14px] font-semibold">{g.title}</h2>
          {g.list.map((m) => (
            <ModelCard key={m.id} m={m} />
          ))}
        </section>
      ))}
    </div>
  );
}

const PROVIDER_NAME = { higgsfield: "Higgsfield", fal: "fal.ai", mock: "모의" } as const;

function ResolvedChip({ m }: { m: AdminModelItem }) {
  if (m.resolved === "mock") return <Badge tone="warning">● 모의 생성</Badge>;
  if (!m.resolved) return <Badge tone="danger">● API 키 필요</Badge>;
  return <Badge tone="success">● {PROVIDER_NAME[m.resolved]}로 생성</Badge>;
}

function ProviderPicker({ m }: { m: AdminModelItem }) {
  const router = useRouter();
  const [value, setValue] = React.useState<"auto" | "higgsfield" | "fal">(m.config.provider ?? "auto");
  if (m.providers.length < 2) return null;
  async function change(v: "auto" | "higgsfield" | "fal") {
    const prev = value;
    setValue(v);
    try {
      await fetchJson("/api/admin/models", { method: "PATCH", body: JSON.stringify({ modelId: m.id, provider: v === "auto" ? null : v }) });
      toast.success(v === "auto" ? "공급자를 자동으로 고를게요." : `${PROVIDER_NAME[v]}로 고정했어요.`);
      router.refresh();
    } catch (e) {
      setValue(prev);
      toast.error((e as Error).message);
    }
  }
  return (
    <Segmented
      size="xs"
      value={value}
      onChange={change}
      options={[
        { value: "auto", label: "자동" },
        ...m.providers.map((p) => ({ value: p.id, label: `${PROVIDER_NAME[p.id]}${p.configured ? "" : " (키 없음)"}` })),
      ]}
    />
  );
}

function ModelCard({ m }: { m: AdminModelItem }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [enabled, setEnabled] = React.useState(m.config.enabled);
  const [prices, setPrices] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(m.prices.map((p) => [p.key, m.config.priceOverrides[p.key] !== undefined ? String(m.config.priceOverrides[p.key]) : ""])),
  );
  const [notes, setNotes] = React.useState(m.config.notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const overrides = Object.keys(m.config.priceOverrides).length;

  const invalid = Object.values(prices).some((v) => v.trim() !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 1000));

  async function toggle(v: boolean) {
    setEnabled(v);
    try {
      await fetchJson("/api/admin/models", { method: "PATCH", body: JSON.stringify({ modelId: m.id, enabled: v }) });
      toast.success(v ? `${m.name}을(를) 켰어요.` : `${m.name}을(를) 껐어요. 스튜디오에서 선택할 수 없어요.`);
      router.refresh();
    } catch (e) {
      setEnabled(!v);
      toast.error((e as Error).message);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const priceOverrides = Object.fromEntries(
        Object.entries(prices)
          .filter(([, v]) => v.trim() !== "")
          .map(([k, v]) => [k, Number(v)]),
      );
      await fetchJson("/api/admin/models", { method: "PATCH", body: JSON.stringify({ modelId: m.id, priceOverrides, notes: notes.trim() || null }) });
      toast.success("저장했어요.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-line bg-panel transition", !enabled && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <ModelSwatch model={m} className="size-11" />
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{m.name}</span>
            <span className="text-[12px] text-fg-4">{m.vendor}</span>
            <ResolvedChip m={m} />
            {m.supportsDraft && (
              <Badge tone="outline" title="480p 드래프트 → 같은 테이크 1080p 완성 (공식 기능)">
                드래프트 → {m.draftResolved ? PROVIDER_NAME[m.draftResolved] : "사용 불가"}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-fg-3">{m.tagline}</p>
          {m.providers.length > 1 && (
            <div className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-4">
              공급자 <ProviderPicker m={m} />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end text-right">
          <span className="text-[14px] font-semibold tabular-nums">{usd(m.usage.spend)}</span>
          <span className="text-[11.5px] tabular-nums text-fg-4">
            이번 달 {m.usage.count.toLocaleString()}건{m.usage.failed ? ` · 실패 ${m.usage.failed}` : ""}
          </span>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-fg-3">
          <Switch checked={enabled} onCheckedChange={toggle} aria-label={`${m.name} 사용`} />
          {enabled ? "사용" : "꺼짐"}
        </label>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          단가·공지{overrides ? <Badge tone="accent">수정 {overrides}</Badge> : null}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open && (
        <div className="grid gap-5 border-t border-line bg-panel-2/30 p-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-fg-2">단가표</span>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-fg-4">
                  <th className="pb-1.5 font-medium">항목</th>
                  <th className="pb-1.5 text-right font-medium">기본값</th>
                  <th className="w-36 pb-1.5 pl-3 font-medium">변경 값</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {m.prices.map((p) => (
                  <tr key={p.key}>
                    <td className="py-1.5 text-fg-2">
                      {p.label}
                      <span className="ml-1 text-[11px] text-fg-4">/ {p.unit}</span>
                    </td>
                    <td className="py-1.5 text-right font-mono text-[12px] tabular-nums text-fg-3">{p.unit === "x" ? `×${p.usd}` : `$${p.usd}`}</td>
                    <td className="py-1.5 pl-3">
                      <Input
                        inputMode="decimal"
                        value={prices[p.key] ?? ""}
                        placeholder={String(p.usd)}
                        onChange={(e) => setPrices((s) => ({ ...s, [p.key]: e.target.value }))}
                        className="h-8 font-mono text-[12px] tabular-nums"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.priceNote && <p className="text-[11.5px] text-fg-4">{m.priceNote}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-medium text-fg-2">스튜디오 공지</span>
            <Textarea value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="예: 이번 주는 프로모션 단가가 적용돼요. / 긴 영상은 H3를 권장해요." className="min-h-24 text-[13px]" />
            <p className="text-[11.5px] text-fg-4">이 모델을 고른 사람에게 스튜디오에서 보여줘요. 비워 두면 표시하지 않아요.</p>
            <div className="mt-auto flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPrices(Object.fromEntries(m.prices.map((p) => [p.key, ""])));
                }}
              >
                기본값으로
              </Button>
              <Button variant="primary" size="sm" loading={saving} disabled={invalid} onClick={save}>
                저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
