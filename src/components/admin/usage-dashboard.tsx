"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Table2 } from "lucide-react";
import * as React from "react";

import { DailySpendChart, HorizontalBarChart } from "@/components/admin/charts";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Avatar } from "@/components/ui/misc";
import type { UsageStats } from "@/lib/services/admin";
import { cn, fetchJson, usd } from "@/lib/utils";

type Range = "month" | "7d" | "30d" | "90d";

export function UsageDashboard() {
  const [range, setRange] = React.useState<Range>("month");
  const [tables, setTables] = React.useState(false);
  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["admin-usage", range],
    queryFn: () => fetchJson<UsageStats>(`/api/admin/usage?range=${range}`),
    placeholderData: keepPreviousData,
  });
  const t = data?.totals;
  const successRate = t && t.total ? Math.round((t.completed / Math.max(1, t.completed + t.failed)) * 100) : null;

  return (
    <section className="flex flex-col gap-4">
      {/* 필터: 한 줄, 차트 위 */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "month", label: "이번 달" },
            { value: "7d", label: "최근 7일" },
            { value: "30d", label: "최근 30일" },
            { value: "90d", label: "최근 90일" },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={() => setTables((v) => !v)} className="ml-auto">
          <Table2 /> {tables ? "차트로 보기" : "표로 보기"}
        </Button>
      </div>

      <div className={cn("flex flex-col gap-4 transition-opacity", isFetching && !isLoading && "opacity-60")}>
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="사용 금액" value={t ? usd(t.spend) : "–"} hint="실패·검열 제외, 확정 금액 우선" big />
          <Stat label="생성 요청" value={t ? t.total.toLocaleString() : "–"} hint={t ? `영상 ${t.videos.toLocaleString()}건` : undefined} />
          <Stat label="성공률" value={successRate === null ? "–" : `${successRate}%`} hint={t ? `실패 ${t.failed}건` : undefined} />
          <Stat label="활성 사용자" value={t ? t.users.toLocaleString() : "–"} hint="기간 내 생성한 사람" />
          <Stat label="새 결과물" value={t ? t.assets.toLocaleString() : "–"} hint="이미지·영상·업로드" />
        </div>

        {tables && data ? (
          <TablesView data={data} />
        ) : (
          <>
            <Card title="일별 사용 금액" subtitle="막대에 마우스를 올리면 금액과 건수가 보여요">
              {isLoading ? <div className="skeleton h-[240px] rounded-xl" /> : <DailySpendChart data={data?.daily ?? []} />}
            </Card>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="팀별 사용 금액">
                {data?.byTeam.length ? (
                  <HorizontalBarChart
                    data={data.byTeam.map((x) => ({ name: x.name, spend: x.spend, count: x.count, cap: x.cap }))}
                    extra={(p) => `생성 ${Number(p.count).toLocaleString()}건${p.cap ? ` · 한도 ${usd(Number(p.cap))}` : ""}`}
                  />
                ) : (
                  <Empty />
                )}
              </Card>
              <Card title="모델별 사용 금액">
                {data?.byModel.length ? (
                  <HorizontalBarChart data={data.byModel.map((x) => ({ name: x.name, spend: x.spend, count: x.count }))} extra={(p) => `생성 ${Number(p.count).toLocaleString()}건`} />
                ) : (
                  <Empty />
                )}
              </Card>
            </div>
            <Card title="사용 금액 상위 구성원">
              {data?.topUsers.length ? (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] text-fg-4">
                      <th className="pb-2 font-medium">구성원</th>
                      <th className="pb-2 font-medium">팀</th>
                      <th className="pb-2 text-right font-medium">생성</th>
                      <th className="pb-2 text-right font-medium">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.topUsers.map((u) => (
                      <tr key={u.userId}>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <Avatar name={u.name} size={22} />
                            {u.name}
                          </span>
                        </td>
                        <td className="py-2 text-fg-3">{u.teamName ?? "-"}</td>
                        <td className="py-2 text-right tabular-nums text-fg-2">{u.count.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">{usd(u.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty />
              )}
            </Card>
          </>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, hint, big }: { label: string; value: string; hint?: string; big?: boolean }) {
  return (
    <div className={cn("corners flex flex-col gap-2 rounded-2xl border border-line bg-white/[0.015] p-4", big && "col-span-2 lg:col-span-1")}>
      <span className="text-[12px] text-fg-3">{label}</span>
      <span className={cn("num", big ? "text-[44px]" : "text-[38px]", big && "glow-text")}>{value}</span>
      {hint && <span className="text-[11.5px] text-fg-4">{hint}</span>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white/[0.015] p-5">
      <div className="mb-4">
        <h3 className="text-[14px] font-medium">{title}</h3>
        {subtitle && <p className="text-[12px] text-fg-4">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="py-8 text-center text-sm text-fg-4">이 기간에는 데이터가 없어요.</p>;
}

function TablesView({ data }: { data: UsageStats }) {
  const block = (title: string, head: string[], rows: (string | number)[][]) => (
    <Card title={title}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-fg-4">
            {head.map((h, i) => (
              <th key={h} className={cn("pb-2 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cn("py-1.5", j > 0 && "text-right tabular-nums")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {block("일별", ["날짜", "건수", "금액"], data.daily.map((d) => [d.day, d.count, usd(d.spend, true)]))}
      {block("팀별", ["팀", "건수", "금액"], data.byTeam.map((d) => [d.name, d.count, usd(d.spend, true)]))}
      {block("모델별", ["모델", "건수", "금액"], data.byModel.map((d) => [d.name, d.count, usd(d.spend, true)]))}
    </div>
  );
}
