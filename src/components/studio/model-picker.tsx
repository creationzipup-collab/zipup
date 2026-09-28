"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import type { ModelDef } from "@/lib/models/types";
import { cn } from "@/lib/utils";

export type ModelStatus = {
  enabled: boolean;
  /** 실제 동작 공급자 (null = 키 없음) */
  provider: "higgsfield" | "fal" | "mock" | null;
  priceOverrides: Record<string, number>;
  /** 관리자 공지 (예: "이번 주 프로모션 단가") */
  notes?: string | null;
};

export function ModelSwatch({ model, className }: { model: Pick<ModelDef, "gradient" | "vendor">; className?: string }) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden rounded-[10px] ring-1 ring-white/10", className)}
      style={{ background: model.gradient }}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
      <span className="absolute bottom-0.5 right-1 font-mono text-[8px] font-bold tracking-wider text-white/80">
        {model.vendor.slice(0, 2).toUpperCase()}
      </span>
    </span>
  );
}

export function ProviderTag({ status }: { status?: ModelStatus; model?: ModelDef }) {
  if (status && !status.enabled) return <span className="rounded bg-danger/12 px-1.5 py-0.5 text-[10px] text-danger">비활성</span>;
  if (!status?.provider) return <span className="rounded bg-danger/12 px-1.5 py-0.5 text-[10px] text-danger">키 필요</span>;
  if (status.provider === "mock") return <span className="rounded bg-warning/12 px-1.5 py-0.5 font-mono text-[10px] text-warning">MOCK</span>;
  return (
    <span className="rounded bg-panel-3 px-1.5 py-0.5 text-[10px] text-fg-3">{status.provider === "higgsfield" ? "Higgsfield" : "fal.ai"}</span>
  );
}

export function ModelPicker({
  models,
  value,
  onChange,
  status,
}: {
  models: ModelDef[];
  value: ModelDef;
  onChange: (m: ModelDef) => void;
  status: Record<string, ModelStatus>;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-3 rounded-2xl border border-line-2 bg-panel-2/60 p-2.5 pr-3 text-left transition hover:border-line-3 hover:bg-panel-2"
        >
          <ModelSwatch model={value} className="size-11" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-semibold tracking-tight">{value.name}</span>
              {value.badge && <span className="rounded bg-inv px-1 font-mono text-[9px] font-bold text-inv-fg">{value.badge}</span>}
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] text-fg-3">{value.tagline}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-fg-4 transition group-hover:text-fg-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(560px,calc(100vw-24px))] p-2">
        <div className="grid gap-1 sm:grid-cols-2">
          {models.map((m) => {
            const s = status[m.id];
            const active = m.id === value.id;
            const disabled = !!s && (!s.enabled || !s.provider);
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className={cn(
                  "relative flex gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                  active ? "border-line-3 bg-panel-3" : "border-transparent hover:bg-panel-2",
                )}
              >
                <ModelSwatch model={m} className="size-12" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold">{m.name}</span>
                    {m.badge && <span className="rounded bg-inv px-1 font-mono text-[9px] font-bold text-inv-fg">{m.badge}</span>}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-3">{m.tagline}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10.5px] text-fg-4">{m.vendor}</span>
                    <ProviderTag status={s} model={m} />
                  </span>
                </span>
                {active && <Check className="absolute right-2.5 top-2.5 size-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
