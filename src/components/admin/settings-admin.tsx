"use client";

import { Globe, Lock, RotateCcw, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Segmented, Slider, Switch } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { FILENAME_TOKENS, renderFilename } from "@/lib/naming";
import type { Visibility } from "@/lib/types";
import { cn, fetchJson } from "@/lib/utils";

export type SettingsValue = {
  filenameTemplate: string;
  concurrency: { higgsfield: number; fal: number; mock: number };
  defaultVisibility: Visibility;
  allowSignup: boolean;
  signupDomains: string[];
  budgetWarnPercent: number;
  llmModel: string;
};

type LlmInfo = {
  provider: "openai" | "fal" | "mock" | null;
  presets: { id: string; label: string; price: string; note: string }[];
  defaultModel: string;
};

const DEFAULT_TEMPLATE = "{project}_{model}_{date}_{seq}";
/** 미리보기용 고정 시각 (서버·브라우저 렌더 결과를 같게) */
const SAMPLE_DATE = new Date("2026-09-28T14:30:15+09:00");
const PRESETS = [
  { label: "기본", value: DEFAULT_TEMPLATE },
  { label: "팀 중심", value: "{team}_{project}_{date}_{seq}" },
  { label: "프롬프트 포함", value: "{project}_{prompt}_{model}_{seq}" },
  { label: "작업자 포함", value: "{date}_{user}_{model}_{ratio}_{seq}" },
];

const SAMPLES = [
  {
    project: "신제품런칭",
    team: "AI제작팀",
    user: "김지훈",
    model: "seedream5pro",
    kind: "image" as const,
    seq: 12,
    prompt: "네온사인이 빛나는 비 오는 서울 밤거리, 시네마틱",
    ratio: "16:9",
    res: "2K",
    index: 0,
    ext: "png",
  },
  {
    project: "뮤직비디오-A",
    team: "연출팀",
    user: "박서연",
    model: "seedance25",
    kind: "video" as const,
    seq: 138,
    prompt: "slow dolly-in on a dancer under red stage lights",
    ratio: "9:16",
    res: "720p",
    index: 1,
    ext: "mp4",
  },
];

export function SettingsAdmin({ initial, llm }: { initial: SettingsValue; llm: LlmInfo }) {
  const router = useRouter();
  const [v, setV] = React.useState<SettingsValue>(initial);
  const [saved, setSaved] = React.useState<SettingsValue>(initial);
  const [saving, setSaving] = React.useState(false);
  const [domainDraft, setDomainDraft] = React.useState("");
  const templateRef = React.useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = <K extends keyof SettingsValue>(k: K, value: SettingsValue[K]) => setV((s) => ({ ...s, [k]: value }));

  const unknownTokens = Array.from(v.filenameTemplate.matchAll(/\{(\w+)\}/g))
    .map((m) => `{${m[1]}}`)
    .filter((t) => !FILENAME_TOKENS.some((x) => x.token === t));
  const templateInvalid = v.filenameTemplate.trim().length < 3 || unknownTokens.length > 0;

  function insertToken(token: string) {
    const el = templateRef.current;
    const start = el?.selectionStart ?? v.filenameTemplate.length;
    const end = el?.selectionEnd ?? start;
    const next = v.filenameTemplate.slice(0, start) + token + v.filenameTemplate.slice(end);
    set("filenameTemplate", next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function addDomain() {
    const d = domainDraft.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
      toast.error("도메인 형식이 아니에요. 예: creationzipup.com");
      return;
    }
    if (!v.signupDomains.includes(d)) set("signupDomains", [...v.signupDomains, d]);
    setDomainDraft("");
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetchJson<{ settings: SettingsValue }>("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ ...v, filenameTemplate: v.filenameTemplate.trim() }),
      });
      setV(r.settings);
      setSaved(r.settings);
      toast.success("설정을 저장했어요.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4 pb-24">
      {/* ------------------------------ 파일명 ------------------------------ */}
      <Section title="자동 파일명" description="새로 생성·업로드되는 파일과 다운로드 파일명에 적용돼요. 순번은 프로젝트마다 따로 매겨져요.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set("filenameTemplate", p.value)}
                className={cn(
                  "h-7 rounded-full border px-3 text-[12px] transition",
                  v.filenameTemplate === p.value ? "border-fg bg-inv text-inv-fg" : "border-line-2 text-fg-2 hover:border-line-3",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Input
            ref={templateRef}
            value={v.filenameTemplate}
            onChange={(e) => set("filenameTemplate", e.target.value)}
            className="font-mono text-[13px]"
            spellCheck={false}
            aria-label="파일명 템플릿"
          />
          {unknownTokens.length > 0 && <p className="text-xs text-danger">알 수 없는 토큰: {unknownTokens.join(", ")}</p>}
          <div className="flex flex-wrap gap-1.5">
            {FILENAME_TOKENS.map((t) => (
              <button
                key={t.token}
                type="button"
                onClick={() => insertToken(t.token)}
                title={`${t.label} · 예: ${t.example}`}
                className="group flex h-7 items-center gap-1.5 rounded-lg border border-line-2 bg-panel-2/60 px-2 text-[12px] transition hover:border-line-3 hover:bg-panel-3"
              >
                <code className="font-mono text-[11.5px] text-fg">{t.token}</code>
                <span className="text-fg-4 group-hover:text-fg-3">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-bg-2 p-3">
            <span className="eyebrow">Preview</span>
            {SAMPLES.map((s, i) => (
              <code key={i} className="break-all font-mono text-[12.5px] text-fg-2">
                {renderFilename(v.filenameTemplate, { ...s, date: SAMPLE_DATE })}
              </code>
            ))}
          </div>
        </div>
      </Section>

      {/* ------------------------------- 가입 ------------------------------- */}
      <Section title="회원가입" description="가입한 사람은 관리자가 승인해야 이용할 수 있어요.">
        <Row label="가입 신청 받기" hint="끄면 가입 화면에서 새 신청을 받지 않아요. 기존 사용자는 그대로 로그인할 수 있어요.">
          <Switch checked={v.allowSignup} onCheckedChange={(c) => set("allowSignup", c)} />
        </Row>
        <Row label="허용 이메일 도메인" hint="비워 두면 모든 이메일로 가입 신청할 수 있어요." stacked>
          <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-line-2 bg-panel-2/70 p-1.5">
            {v.signupDomains.map((d) => (
              <span key={d} className="flex h-7 items-center gap-1 rounded-md bg-panel-3 pl-2 pr-1 text-[12.5px]">
                @{d}
                <button type="button" aria-label={`${d} 삭제`} onClick={() => set("signupDomains", v.signupDomains.filter((x) => x !== d))} className="rounded p-0.5 text-fg-3 hover:bg-panel-2 hover:text-fg">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <input
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addDomain();
                } else if (e.key === "Backspace" && !domainDraft && v.signupDomains.length) {
                  set("signupDomains", v.signupDomains.slice(0, -1));
                }
              }}
              onBlur={addDomain}
              placeholder={v.signupDomains.length ? "" : "예: creationzipup.com (Enter로 추가)"}
              className="h-7 min-w-[180px] flex-1 bg-transparent px-1.5 text-[13px] outline-none placeholder:text-fg-4"
            />
          </div>
        </Row>
      </Section>

      {/* ------------------------------- 공유 ------------------------------- */}
      <Section title="공유 기본값" description="새 프로젝트를 만들 때 기본으로 선택되는 공개 범위예요.">
        <Segmented
          value={v.defaultVisibility}
          onChange={(x) => set("defaultVisibility", x)}
          size="md"
          className="self-start"
          options={[
            { value: "private", label: <span className="flex items-center gap-1.5"><Lock className="size-3.5" /> 비공개</span> },
            { value: "team", label: <span className="flex items-center gap-1.5"><Users className="size-3.5" /> 팀 공개</span> },
            { value: "company", label: <span className="flex items-center gap-1.5"><Globe className="size-3.5" /> 전사 공개</span> },
          ]}
        />
      </Section>

      {/* ------------------------------- 예산 ------------------------------- */}
      <Section title="예산 경고" description="팀·개인 한도의 이 비율을 넘으면 본인, 팀장, 관리자에게 알림을 보내요.">
        <div className="flex items-center gap-4">
          <Slider value={[v.budgetWarnPercent]} min={50} max={100} step={5} onValueChange={([x]) => set("budgetWarnPercent", x)} className="max-w-sm" />
          <span className="w-14 text-right font-mono text-[15px] font-semibold tabular-nums">{v.budgetWarnPercent}%</span>
        </div>
      </Section>

      {/* ------------------------------ LLM ------------------------------- */}
      <Section
        title="번역·단어 추천 AI"
        description="스튜디오의 한국어 대조 번역, 단어 추천, 한→영/중 변환에 쓰는 언어 모델이에요. 호출 1회에 보통 $0.001 미만이에요."
      >
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="text-fg-3">연결 상태</span>
          {llm.provider === "fal" ? (
            <span className="rounded-md bg-success/12 px-1.5 py-0.5 text-[11px] text-success">● fal.ai (OpenRouter)</span>
          ) : llm.provider === "openai" ? (
            <span className="rounded-md bg-success/12 px-1.5 py-0.5 text-[11px] text-success">● 직접 연결 (LLM_BASE_URL)</span>
          ) : llm.provider === "mock" ? (
            <span className="rounded-md bg-warning/12 px-1.5 py-0.5 text-[11px] text-warning">● 모의 (키 없음·개발용)</span>
          ) : (
            <span className="rounded-md bg-danger/12 px-1.5 py-0.5 text-[11px] text-danger">● 꺼짐</span>
          )}
        </div>
        {llm.provider !== "openai" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {llm.presets.map((p) => {
              const active = (v.llmModel || llm.defaultModel) === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set("llmModel", p.id === llm.defaultModel ? "" : p.id)}
                  className={cn("flex flex-col gap-0.5 rounded-xl border p-3 text-left transition", active ? "border-fg bg-panel-2" : "border-line-2 hover:border-line-3")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">{p.label}</span>
                    <span className="font-mono text-[11px] text-fg-3">{p.price}</span>
                  </span>
                  <span className="text-[11.5px] text-fg-4">{p.note}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[12px] text-fg-4">LLM_BASE_URL로 직접 연결 중이에요. 모델은 LLM_MODEL 환경 변수로 정해요.</p>
        )}
      </Section>

      {/* ---------------------------- 동시 실행 ----------------------------- */}
      <Section title="동시 실행 한도" description="공급자에 동시에 보내는 작업 수예요. 넘치는 작업은 사내 대기열에서 순서대로 처리돼요. Higgsfield 계정 플랜의 동시 실행 한도에 맞춰 주세요.">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["higgsfield", "Higgsfield"],
              ["fal", "fal.ai"],
              ["mock", "모의 생성"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-fg-3">{label}</span>
              <Input
                type="number"
                min={1}
                max={100}
                value={v.concurrency[k]}
                onChange={(e) => set("concurrency", { ...v.concurrency, [k]: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))) })}
                className="font-mono tabular-nums"
              />
            </label>
          ))}
        </div>
      </Section>

      {/* ------------------------------ 저장 바 ------------------------------ */}
      <div
        className={cn(
          "fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-line-2 bg-elevated/90 py-2 pl-4 pr-2 shadow-[var(--shadow-pop)] backdrop-blur-xl transition-all duration-300 lg:left-[calc(50%+124px)]",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <span className="text-[13px] text-fg-2">저장하지 않은 변경사항이 있어요</span>
        <Button variant="ghost" size="sm" onClick={() => setV(saved)}>
          <RotateCcw /> 되돌리기
        </Button>
        <Button variant="primary" size="sm" loading={saving} disabled={templateInvalid} onClick={save}>
          저장
        </Button>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-panel p-5 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-[12px] leading-relaxed text-fg-4">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children, stacked }: { label: string; hint?: string; children: React.ReactNode; stacked?: boolean }) {
  return (
    <div className={cn("flex gap-3", stacked ? "flex-col" : "items-center justify-between")}>
      <div>
        <div className="text-[13px] font-medium text-fg-2">{label}</div>
        {hint && <div className="text-[12px] text-fg-4">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
