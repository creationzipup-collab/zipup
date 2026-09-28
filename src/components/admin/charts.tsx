"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { usd } from "@/lib/utils";

/**
 * 차트 규칙 (dataviz):
 * - 단일 시리즈 → 한 가지 색(--viz-1), 범례 없음(제목이 설명)
 * - 막대 굵기 ≤ 24px, 끝만 4px 라운드, 기준선은 직각
 * - 격자선은 실선 헤어라인, 축 텍스트는 muted 토큰
 * - 툴팁: 값이 먼저(굵게), 라벨은 보조
 */

type TipPayload = { value?: number; payload?: Record<string, unknown> };

function ValueTooltip({ active, payload, label, unit = "usd", extra }: { active?: boolean; payload?: TipPayload[]; label?: string; unit?: "usd" | "count"; extra?: (p: Record<string, unknown>) => string | null }) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0].value ?? 0);
  const more = payload[0].payload && extra ? extra(payload[0].payload) : null;
  return (
    <div className="rounded-lg border border-line-2 bg-elevated px-3 py-2 shadow-[var(--shadow-soft)]">
      <p className="text-[14px] font-semibold text-fg">{unit === "usd" ? usd(v, true) : v.toLocaleString()}</p>
      <p className="text-[11.5px] text-fg-3">{label}</p>
      {more && <p className="mt-0.5 text-[11px] text-fg-4">{more}</p>}
    </div>
  );
}

const axisTick = { fill: "var(--fg-4)", fontSize: 11 };

export function DailySpendChart({ data }: { data: { day: string; spend: number; count: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: d.day.slice(5).replace("-", "/") }));
  const interval = rows.length > 40 ? Math.ceil(rows.length / 12) : rows.length > 20 ? 2 : 0;
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--line-2)" }} interval={interval} />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => (v === 0 ? "$0" : `$${(v / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: v < 1_000_000 ? 2 : 0 })}`)}
          />
          <Tooltip
            cursor={{ fill: "var(--line)" }}
            content={<ValueTooltip extra={(p) => `생성 ${Number(p.count ?? 0).toLocaleString()}건`} />}
          />
          <Bar dataKey="spend" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={24} activeBar={{ fill: "var(--accent-2)" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalBarChart({
  data,
  valueKey = "spend",
  unit = "usd",
  extra,
}: {
  data: { name: string; [k: string]: unknown }[];
  valueKey?: string;
  unit?: "usd" | "count";
  extra?: (p: Record<string, unknown>) => string | null;
}) {
  const height = Math.max(120, data.length * 34 + 16);
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--line)" strokeWidth={1} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fill: "var(--fg-2)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--line-2)" }} width={116} />
          <Tooltip cursor={{ fill: "var(--line)" }} content={<ValueTooltip unit={unit} extra={extra} />} />
          <Bar
            dataKey={valueKey}
            fill="var(--viz-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            activeBar={{ fill: "var(--accent-2)" }}
            label={{
              position: "right",
              fill: "var(--fg-2)",
              fontSize: 11.5,
              formatter: (v: unknown) => (unit === "usd" ? usd(Number(v)) : Number(v).toLocaleString()),
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
