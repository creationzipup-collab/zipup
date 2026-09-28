import { FolderKanban, Image as ImageIcon, Settings, ShieldCheck, Sparkles, UserRound, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Avatar, EmptyState, TimeAgo } from "@/components/ui/misc";
import { getModel } from "@/lib/models/registry";
import { AUDIT_CATEGORIES, type AuditCategory, type AuditRow, listAudit } from "@/lib/services/admin";
import { listTeams } from "@/lib/services/teams";
import { ROLE_LABEL, STATUS_LABEL, type UserRole, type UserStatus, VISIBILITY_LABEL, type Visibility } from "@/lib/types";
import { cn, formatDateTime, usd } from "@/lib/utils";

export const metadata: Metadata = { title: "감사 로그 · 관리자" };

const PAGE = 100;

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  user: "사용자",
  team: "팀",
  project: "프로젝트",
  assets: "파일",
  model: "모델",
  settings: "설정",
};

const CATEGORY_ICON = {
  user: UserRound,
  team: UsersRound,
  project: FolderKanban,
  assets: ImageIcon,
  model: Sparkles,
  settings: Settings,
} as const;

const ACTION_LABEL: Record<string, string> = {
  "user.signup": "가입 신청",
  "user.bootstrap_admin": "최초 관리자로 지정됨",
  "user.approve": "가입 승인",
  "user.update": "사용자 정보 변경",
  "user.reset_password": "비밀번호 초기화",
  "user.delete": "사용자 삭제",
  "team.create": "팀 생성",
  "team.update": "팀 수정",
  "team.delete": "팀 삭제",
  "project.create": "프로젝트 생성",
  "project.update": "프로젝트 수정",
  "project.delete": "프로젝트 삭제",
  "assets.delete": "파일을 휴지통으로",
  "assets.restore": "파일 복원",
  "assets.move": "파일 이동",
  "assets.purge": "파일 영구 삭제",
  "model.update": "모델 설정 변경",
  "settings.update": "시스템 설정 변경",
};

const SETTING_LABEL: Record<string, string> = {
  filenameTemplate: "파일명 규칙",
  concurrency: "동시 실행 한도",
  defaultVisibility: "공유 기본값",
  allowSignup: "가입 허용",
  signupDomains: "허용 도메인",
  budgetWarnPercent: "예산 경고 기준",
};

function describe(row: AuditRow, teamName: (id: string) => string | undefined): string | null {
  const m = (row.meta ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  switch (row.action) {
    case "user.approve":
    case "user.update": {
      if (typeof m.status === "string") parts.push(`상태 → ${STATUS_LABEL[m.status as UserStatus] ?? m.status}`);
      if (typeof m.role === "string") parts.push(`권한 → ${ROLE_LABEL[m.role as UserRole] ?? m.role}`);
      if ("teamId" in m) parts.push(`팀 → ${m.teamId ? (teamName(String(m.teamId)) ?? "삭제된 팀") : "없음"}`);
      if ("monthlyBudgetMicros" in m) parts.push(`개인 한도 → ${m.monthlyBudgetMicros == null ? "없음" : usd(Number(m.monthlyBudgetMicros))}`);
      if (typeof m.name === "string") parts.push(`이름 → ${m.name}`);
      break;
    }
    case "user.signup":
      if (typeof m.email === "string") parts.push(m.email);
      if (typeof m.requestedTeamId === "string") parts.push(`희망 팀 ${teamName(m.requestedTeamId) ?? "-"}`);
      break;
    case "user.delete":
      if (typeof m.email === "string") parts.push(m.email);
      break;
    case "team.create":
    case "team.update":
      if ("monthlyBudgetMicros" in m) parts.push(`월 한도 ${m.monthlyBudgetMicros == null ? "없음" : usd(Number(m.monthlyBudgetMicros))}`);
      break;
    case "project.update":
      if (typeof m.name === "string") parts.push(`이름 → ${m.name}`);
      if (typeof m.visibility === "string") parts.push(`공개 범위 → ${VISIBILITY_LABEL[m.visibility as Visibility] ?? m.visibility}`);
      if ("archived" in m) parts.push(m.archived ? "보관" : "보관 해제");
      break;
    case "model.update":
      if (typeof m.enabled === "boolean") parts.push(m.enabled ? "사용 켬" : "사용 끔");
      if (m.priceOverrides && typeof m.priceOverrides === "object") {
        const n = Object.keys(m.priceOverrides).length;
        parts.push(n ? `단가 ${n}개 변경` : "단가 기본값");
      }
      if ("notes" in m) parts.push(m.notes ? "공지 수정" : "공지 삭제");
      break;
    case "settings.update":
      parts.push(
        Object.keys(m)
          .map((k) => SETTING_LABEL[k] ?? k)
          .join(", "),
      );
      break;
    default:
      if (typeof m.count === "number") parts.push(`${m.count}개`);
      if (Array.isArray(m.ids)) parts.push(`${m.ids.length}개`);
  }
  return parts.filter(Boolean).join(" · ") || null;
}

function targetLabel(row: AuditRow): string | null {
  if (row.targetType === "model" && row.targetId) return getModel(row.targetId)?.name ?? row.targetId;
  if (row.targetName) return row.targetName;
  if (row.targetType && row.targetId) return "(삭제됨)";
  return null;
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ type?: string; before?: string }> }) {
  const sp = await searchParams;
  const category = (AUDIT_CATEGORIES as readonly string[]).includes(sp.type ?? "") ? (sp.type as AuditCategory) : null;
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : null;
  const [rows, teams] = await Promise.all([listAudit({ category, before, limit: PAGE }), listTeams()]);
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const href = (type: AuditCategory | null, beforeIso?: string) => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (beforeIso) p.set("before", beforeIso);
    const qs = p.toString();
    return `/admin/audit${qs ? `?${qs}` : ""}`;
  };

  // 날짜별 그룹
  const groups: { day: string; items: AuditRow[] }[] = [];
  for (const r of rows) {
    const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(r.createdAt);
    const g = groups.at(-1);
    if (g && g.day === day) g.items.push(r);
    else groups.push({ day, items: [r] });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {[null, ...AUDIT_CATEGORIES].map((c) => (
          <Link
            key={c ?? "all"}
            href={href(c)}
            className={cn(
              "h-8 rounded-full border px-3 text-[12.5px] leading-[30px] transition",
              category === c ? "border-fg bg-inv text-inv-fg" : "border-line-2 text-fg-2 hover:border-line-3",
            )}
          >
            {c ? CATEGORY_LABEL[c] : "전체"}
          </Link>
        ))}
        {before && (
          <Link href={href(category)} className="ml-auto text-[12.5px] text-fg-3 hover:text-fg">
            최신으로 ↑
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="기록이 없어요" description="승인·권한·예산·설정 변경 같은 중요한 작업이 여기에 남아요." />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.day} className="flex flex-col gap-2">
              <h2 className="px-1 text-[12px] font-medium text-fg-3">{g.day}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
                {g.items.map((r) => {
                  const cat = r.action.split(".")[0] as AuditCategory;
                  const Icon = CATEGORY_ICON[cat] ?? ShieldCheck;
                  const target = targetLabel(r);
                  const detail = describe(r, (id) => teamMap.get(id));
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-3 text-fg-3">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px]">
                          <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
                          {target && <span className="text-fg-2"> · {target}</span>}
                        </p>
                        {detail && <p className="mt-0.5 truncate text-[12.5px] text-fg-3">{detail}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="flex items-center gap-1.5 text-[12px] text-fg-3">
                          {r.actorName ? (
                            <>
                              <Avatar name={r.actorName} image={r.actorImage} size={18} />
                              {r.actorName}
                            </>
                          ) : (
                            "시스템"
                          )}
                        </span>
                        <span title={formatDateTime(r.createdAt)} className="text-[11.5px] text-fg-4">
                          <TimeAgo date={r.createdAt} />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {rows.length === PAGE && (
            <Link href={href(category, rows[rows.length - 1].createdAt.toISOString())} className="self-center rounded-full border border-line-2 px-4 py-1.5 text-[13px] text-fg-2 transition hover:border-line-3 hover:text-fg">
              이전 기록 더 보기
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
