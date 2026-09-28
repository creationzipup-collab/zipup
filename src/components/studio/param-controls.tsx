"use client";

import { Dices, SlidersHorizontal } from "lucide-react";
import * as React from "react";

import { Segmented, Slider, Switch } from "@/components/ui/controls";
import { Tip } from "@/components/ui/menu";
import type { ModelDef, ParamDef, SelectParam } from "@/lib/models/types";
import { cn } from "@/lib/utils";

type Params = Record<string, unknown>;

export function ParamControls({
  model,
  params,
  onChange,
  compact,
}: {
  model: ModelDef;
  params: Params;
  onChange: (next: Params) => void;
  compact?: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const visible = model.params.filter((p) => !p.hidden?.(params));
  const basic = visible.filter((p) => !p.advanced);
  const advanced = visible.filter((p) => p.advanced);
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      {basic.map((p) => (
        <ParamRow key={p.key} p={p} value={params[p.key]} onChange={(v) => set(p.key, v)} compact={compact} />
      ))}
      {advanced.length > 0 && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-2 self-start text-[12px] font-medium text-fg-3 transition hover:text-fg"
          >
            <SlidersHorizontal className="size-3.5" />
            고급 설정 {showAdvanced ? "접기" : `(${advanced.length})`}
          </button>
          {showAdvanced &&
            advanced.map((p) => (
              <ParamRow key={p.key} p={p} value={params[p.key]} onChange={(v) => set(p.key, v)} compact={compact} />
            ))}
        </div>
      )}
    </div>
  );
}

function RowLabel({ label, hint, right }: { label: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
        {label}
        {hint && (
          <Tip content={hint}>
            <span className="flex size-3.5 cursor-help items-center justify-center rounded-full border border-line-3 text-[9px] text-fg-4">?</span>
          </Tip>
        )}
      </span>
      {right}
    </div>
  );
}

function ParamRow({ p, value, onChange, compact }: { p: ParamDef; value: unknown; onChange: (v: unknown) => void; compact?: boolean }) {
  switch (p.type) {
    case "select":
      if (p.ui === "ratio") return <RatioPicker p={p} value={String(value ?? p.default)} onChange={onChange} compact={compact} />;
      return (
        <div className="flex flex-col gap-2">
          <RowLabel label={p.label} hint={p.hint} />
          <Segmented
            value={String(value ?? p.default)}
            onChange={(v) => onChange(v)}
            options={p.options.map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
            className="w-full"
          />
        </div>
      );
    case "number": {
      const v = typeof value === "number" ? value : p.default;
      return (
        <div className="flex flex-col gap-2">
          <RowLabel
            label={p.label}
            hint={p.hint}
            right={
              <span className="font-mono text-[12px] text-fg">
                {v}
                {p.unit}
              </span>
            }
          />
          {p.presets && (
            <Segmented
              value={String(p.presets.includes(v) ? v : "")}
              onChange={(x) => onChange(Number(x))}
              options={p.presets.map((n) => ({ value: String(n), label: `${n}${p.unit ?? ""}` }))}
              className="w-full"
            />
          )}
          <Slider min={p.min} max={p.max} step={p.step ?? 1} value={[v]} onValueChange={([x]) => onChange(x)} />
        </div>
      );
    }
    case "boolean":
      return (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel-2/40 px-3 py-2.5">
          <span className="flex flex-col">
            <span className="text-[12.5px] font-medium text-fg-2">{p.label}</span>
            {p.hint && <span className="text-[11px] leading-snug text-fg-4">{p.hint}</span>}
          </span>
          <Switch checked={value === undefined ? p.default : !!value} onCheckedChange={(c) => onChange(c)} />
        </label>
      );
    case "seed":
      return (
        <div className="flex flex-col gap-2">
          <RowLabel label={p.label} hint="같은 시드와 설정이면 비슷한 결과가 나와요. 비워두면 무작위." />
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(e) => {
                const t = e.target.value.replace(/[^0-9]/g, "");
                onChange(t === "" ? undefined : Number(t));
              }}
              placeholder="무작위"
              className="h-9 w-full rounded-[10px] border border-line-2 bg-panel-2/70 px-3 font-mono text-[13px] outline-none focus:border-fg-3"
            />
            <button
              type="button"
              onClick={() => onChange(Math.floor(Math.random() * 2_147_483_647))}
              className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line-2 bg-panel-2 text-fg-2 transition hover:text-fg"
              aria-label="무작위 시드"
            >
              <Dices className="size-4" />
            </button>
          </div>
        </div>
      );
  }
}

function RatioIcon({ ratio, active }: { ratio: string; active: boolean }) {
  const [w, h] = ratio.split(":").map(Number);
  let rw = 14;
  let rh = 14;
  if (w && h) {
    if (w >= h) {
      rw = 16;
      rh = Math.max(4, Math.round((16 * h) / w));
    } else {
      rh = 16;
      rw = Math.max(4, Math.round((16 * w) / h));
    }
  }
  return (
    <span className="flex size-[18px] items-center justify-center">
      {w && h ? (
        <span
          className={cn("rounded-[3px] border-[1.5px] transition-colors", active ? "border-inv-fg" : "border-current")}
          style={{ width: rw, height: rh }}
        />
      ) : (
        <span className={cn("size-3.5 rounded-full border-[1.5px] border-dashed", active ? "border-inv-fg" : "border-current")} />
      )}
    </span>
  );
}

function RatioPicker({ p, value, onChange, compact }: { p: SelectParam; value: string; onChange: (v: unknown) => void; compact?: boolean }) {
  const main = p.options.slice(0, compact ? 6 : 10);
  const rest = p.options.slice(compact ? 6 : 10);
  return (
    <div className="flex flex-col gap-2">
      <RowLabel label={p.label} hint={p.hint} />
      <div className={cn("grid gap-1.5", compact ? "grid-cols-6" : "grid-cols-5")}>
        {[...main, ...rest].map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              title={o.hint}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[10px] border py-2 text-[11px] font-medium transition",
                active ? "border-transparent bg-inv text-inv-fg" : "border-line bg-panel-2/40 text-fg-3 hover:border-line-2 hover:text-fg",
              )}
            >
              <RatioIcon ratio={o.value} active={active} />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
