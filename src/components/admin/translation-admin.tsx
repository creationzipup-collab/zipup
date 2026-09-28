"use client";

import { ArrowUpRight, Check, KeyRound, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MtMode, TranslationStatus } from "@/lib/services/translate";
import { cn, fetchJson } from "@/lib/utils";

type ProviderId = TranslationStatus["providers"][number]["id"];

const MODES: { value: MtMode; label: string; hint: string }[] = [
  { value: "auto", label: "자동", hint: "키가 있는 번역 API → 없으면 AI" },
  { value: "azure", label: "Azure", hint: "월 200만 자 무료 · 사전 지원" },
  { value: "papago", label: "파파고", hint: "한국어 품질 최상 · 유료" },
  { value: "google", label: "Google", hint: "월 50만 자 무료" },
  { value: "deepl", label: "DeepL", hint: "기존 키가 있을 때" },
  { value: "llm", label: "AI만", hint: "LLM으로 번역 (호출당 1원 미만)" },
  { value: "off", label: "끄기", hint: "번역·사전 사용 안 함" },
];

const GUIDE: Record<ProviderId, { url: string; steps: string }> = {
  azure: {
    url: "https://portal.azure.com/#create/Microsoft.CognitiveServicesTextTranslation",
    steps: "Azure 포털 → Translator 만들기 → 가격 계층 F0(무료) · 지역 Korea Central → 만든 뒤 '키 및 엔드포인트'에서 키 1과 위치(지역)를 복사",
  },
  papago: {
    url: "https://console.ncloud.com/naver-service/application",
    steps: "NAVER Cloud 콘솔 → Application 등록 → Papago Translation 선택 → Client ID와 Client Secret 복사",
  },
  google: {
    url: "https://console.cloud.google.com/apis/library/translate.googleapis.com",
    steps: "Google Cloud → Cloud Translation API 사용 설정 → 사용자 인증 정보 → API 키 만들기 (Translation API로 제한 권장)",
  },
  deepl: {
    url: "https://www.deepl.com/your-account/keys",
    steps: "DeepL 계정 → API 키 복사",
  },
};

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function TranslationAdmin({ initial }: { initial: TranslationStatus }) {
  const [status, setStatus] = React.useState(initial);
  const [editing, setEditing] = React.useState<ProviderId | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const next = await fetchJson<TranslationStatus>("/api/admin/translation", { method: "PATCH", body: JSON.stringify(body) });
      setStatus(next);
      toast.success(message);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const usageOf = (id: string) => status.usage.find((u) => u.provider === id)?.chars ?? 0;

  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-panel p-5 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-[14px] font-semibold">번역·사전 엔진</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-4">
          한국어 대조(구간별 직역), 단어에 마우스를 올렸을 때의 뜻, 한국어로 적어 바꾸기에 쓰여요. 영상·3D 용어는 사내 용어집이 먼저 풀어 주고, 번역 결과는 회사 전체가 캐시로 함께 써서 같은
          문장은 다시 요금이 들지 않아요.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-fg-3">지금 쓰는 엔진</span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-[11px]", status.engine ? "bg-success/12 text-success" : "bg-danger/12 text-danger")}>● {status.engineLabel}</span>
          {status.engine === "llm" && <span className="text-[11.5px] text-fg-4">번역 API 키를 넣으면 더 싸고 빠른 번역 API로 바뀌어요</span>}
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              disabled={busy}
              onClick={() => m.value !== status.mode && void patch({ mode: m.value }, `번역 엔진: ${m.label}`)}
              className={cn(
                "flex flex-col gap-0.5 rounded-xl border px-2.5 py-2 text-left transition disabled:opacity-60",
                status.mode === m.value ? "border-fg bg-panel-2" : "border-line-2 hover:border-line-3",
              )}
            >
              <span className="text-[12.5px] font-medium">{m.label}</span>
              <span className="text-[10.5px] leading-snug text-fg-4">{m.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          {status.providers.map((p) => {
            const used = usageOf(p.id);
            const pct = p.freeChars ? Math.min(100, (used / p.freeChars) * 100) : 0;
            const over = p.freeChars ? Math.max(0, used - p.freeChars) : used;
            return (
              <div key={p.id} className={cn("flex flex-col gap-2.5 rounded-xl border p-3", p.configured ? "border-line-2" : "border-dashed border-line-2")}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{p.label}</span>
                  {p.configured ? (
                    <span className="rounded bg-success/12 px-1.5 py-px text-[10.5px] text-success">연결됨{p.fromEnv ? " · 환경 변수" : ""}</span>
                  ) : (
                    <span className="rounded bg-panel-3 px-1.5 py-px text-[10.5px] text-fg-4">미설정</span>
                  )}
                  <span className="ml-auto font-mono text-[10.5px] text-fg-4">{p.freeChars ? `무료 월 ${fmt(p.freeChars)}자` : `100만 자당 약 $${p.usdPerMillion}`}</span>
                </div>
                {p.configured && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11.5px] text-fg-3">
                      <span>이번 달 {fmt(used)}자</span>
                      {p.freeChars > 0 && <span className="font-mono">{pct.toFixed(pct < 1 ? 2 : 0)}%</span>}
                    </div>
                    {p.freeChars > 0 && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
                        <div className={cn("h-full rounded-full", pct > 85 ? "bg-warning" : "bg-accent")} style={{ width: `${Math.max(pct, used ? 1.5 : 0)}%` }} />
                      </div>
                    )}
                    {over > 0 && <span className="text-[11px] text-warning">무료 구간을 넘은 {fmt(over)}자 ≈ ${((over / 1_000_000) * p.usdPerMillion).toFixed(2)}</span>}
                    <span className="font-mono text-[11px] text-fg-4">
                      {p.masked}
                      {p.region ? ` · ${p.region}` : ""}
                    </span>
                  </div>
                )}
                {editing === p.id ? (
                  <KeyForm
                    id={p.id}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={async (value) => {
                      const ok = await patch({ keys: { [p.id]: value } }, `${p.label} 키를 저장했어요`);
                      if (ok) setEditing(null);
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    {!p.fromEnv && (
                      <Button variant="secondary" size="xs" onClick={() => setEditing(p.id)}>
                        <KeyRound /> {p.configured ? "키 바꾸기" : "키 입력"}
                      </Button>
                    )}
                    {p.configured && !p.fromEnv && (
                      <Button variant="ghost" size="xs" className="text-danger" disabled={busy} onClick={() => void patch({ keys: { [p.id]: null } }, `${p.label} 키를 지웠어요`)}>
                        <Trash2 /> 지우기
                      </Button>
                    )}
                    <a href={GUIDE[p.id].url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-0.5 text-[11.5px] text-fg-4 hover:text-fg-2">
                      키 발급 <ArrowUpRight className="size-3" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11.5px] leading-relaxed text-fg-4">
          추천: <b className="font-medium text-fg-3">Azure Translator 무료(F0)</b> — 월 200만 자까지 무료이고, 단어 사전(영↔한)까지 돼서 파파고처럼 단어 뜻을 보여 줄 수 있어요. 키는 암호화해서 저장하고, 저장하기
          전에 짧은 번역으로 키가 맞는지 확인해요.
        </p>
      </div>
    </section>
  );
}

function KeyForm({ id, busy, onSave, onCancel }: { id: ProviderId; busy: boolean; onSave: (v: Record<string, string>) => void; onCancel: () => void }) {
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState(id === "azure" ? "koreacentral" : "");
  const fields =
    id === "azure"
      ? [
          { label: "키 (Key 1)", value: a, set: setA, secret: true },
          { label: "지역 (Location/Region)", value: b, set: setB, secret: false },
        ]
      : id === "papago"
        ? [
            { label: "Client ID", value: a, set: setA, secret: false },
            { label: "Client Secret", value: b, set: setB, secret: true },
          ]
        : [{ label: "API 키", value: a, set: setA, secret: true }];
  const value: Record<string, string> = id === "azure" ? { key: a.trim(), region: b.trim() } : id === "papago" ? { id: a.trim(), key: b.trim() } : { key: a.trim() };
  const ready = id === "papago" ? a.trim().length >= 8 && b.trim().length >= 8 : a.trim().length >= 8;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSave(value);
      }}
    >
      <p className="text-[11.5px] leading-relaxed text-fg-4">{GUIDE[id].steps}</p>
      {fields.map((f) => (
        <label key={f.label} className="flex flex-col gap-1">
          <span className="text-[11.5px] text-fg-3">{f.label}</span>
          <Input value={f.value} onChange={(e) => f.set(e.target.value)} type={f.secret ? "password" : "text"} autoComplete="off" className="h-9 font-mono text-[12.5px]" />
        </label>
      ))}
      <div className="flex gap-1.5">
        <Button type="submit" variant="primary" size="xs" loading={busy} disabled={!ready}>
          {!busy && <Check />} 확인 후 저장
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          취소
        </Button>
      </div>
    </form>
  );
}
