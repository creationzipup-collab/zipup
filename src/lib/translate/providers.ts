/**
 * 기계 번역(MT) API 모음. 문장은 여러 구간을 한 번에 보내고, 사전은 Azure만 지원해요.
 * - Azure Translator: 월 200만 자 무료(F0), 사전 조회(영↔한, 영↔중) 지원
 * - Papago(NAVER Cloud): 한국어 품질이 좋지만 유료
 * - Google Cloud Translation: 월 50만 자 무료
 * - DeepL: 기존 키가 있을 때
 */
export type MtLang = "en" | "ko" | "zh";
export type MtProviderId = "azure" | "papago" | "google" | "deepl";

export const MT_PROVIDER_LABEL: Record<MtProviderId, string> = {
  azure: "Azure Translator",
  papago: "Papago (NAVER Cloud)",
  google: "Google Translate",
  deepl: "DeepL",
};

/** 무료 구간 (월, 글자 수). 없으면 0 */
export const MT_FREE_CHARS: Record<MtProviderId, number> = { azure: 2_000_000, papago: 0, google: 500_000, deepl: 0 };
/** 무료 구간을 넘었을 때 100만 자당 대략 요금(USD) */
export const MT_USD_PER_MILLION: Record<MtProviderId, number> = { azure: 10, papago: 15, google: 20, deepl: 25 };

export type MtCredentials = {
  azure?: { key: string; region?: string };
  papago?: { id: string; key: string };
  google?: { key: string };
  deepl?: { key: string };
};

export class MtError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: "auth" | "quota" | "rate" | "bad_request" | "unavailable" | "unknown",
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

function mtError(provider: MtProviderId, status: number, body: string): MtError {
  const label = MT_PROVIDER_LABEL[provider];
  const lower = body.toLowerCase();
  if (status === 401 || (status === 403 && !/quota|limit|exceed/.test(lower))) return new MtError(`${label} 키를 확인해 주세요.`, status, "auth");
  if (/quota|exceed|limit|insufficient|billing/.test(lower) && status !== 429) return new MtError(`${label} 사용 한도를 넘었어요.`, status, "quota");
  if (status === 429) return new MtError(`${label} 요청이 많아요. 잠시 후 다시 시도해 주세요.`, status, "rate");
  if (status === 400) return new MtError(`${label} 요청이 올바르지 않아요: ${body.slice(0, 160)}`, status, "bad_request");
  if (status >= 500) return new MtError(`${label} 서버 오류예요. 잠시 후 다시 시도해 주세요.`, status, "unavailable");
  return new MtError(`${label} 오류 (${status}): ${body.slice(0, 160)}`, status, "unknown");
}

const AZURE_LANG: Record<MtLang, string> = { en: "en", ko: "ko", zh: "zh-Hans" };
const PAPAGO_LANG: Record<MtLang, string> = { en: "en", ko: "ko", zh: "zh-CN" };
const GOOGLE_LANG: Record<MtLang, string> = { en: "en", ko: "ko", zh: "zh-CN" };
const DEEPL_SOURCE: Record<MtLang, string> = { en: "EN", ko: "KO", zh: "ZH" };
const DEEPL_TARGET: Record<MtLang, string> = { en: "EN-US", ko: "KO", zh: "ZH-HANS" };

async function readBody(res: Response) {
  return res.text().catch(() => "");
}

/** 여러 구간을 한 번에 번역 (입력 순서대로 결과) */
export async function mtTranslate(
  provider: MtProviderId,
  creds: MtCredentials,
  texts: string[],
  from: MtLang | null,
  to: MtLang,
  fetchImpl: Fetch = fetch,
): Promise<string[]> {
  if (!texts.length) return [];
  switch (provider) {
    case "azure": {
      const c = creds.azure;
      if (!c?.key) throw new MtError("Azure Translator 키가 없어요.", 400, "auth");
      const out: string[] = [];
      // 요청당 최대 1,000개·5만 자
      for (let i = 0; i < texts.length; i += 100) {
        const chunk = texts.slice(i, i + 100);
        const qs = new URLSearchParams({ "api-version": "3.0", to: AZURE_LANG[to] });
        if (from) qs.set("from", AZURE_LANG[from]);
        const res = await fetchImpl(`https://api.cognitive.microsofttranslator.com/translate?${qs}`, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": c.key,
            ...(c.region ? { "Ocp-Apim-Subscription-Region": c.region } : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(chunk.map((Text) => ({ Text }))),
        });
        if (!res.ok) throw mtError("azure", res.status, await readBody(res));
        const data = (await res.json()) as { translations?: { text: string }[] }[];
        for (const d of data) out.push(d.translations?.[0]?.text ?? "");
      }
      return out;
    }
    case "papago": {
      const c = creds.papago;
      if (!c?.id || !c.key) throw new MtError("Papago 키가 없어요.", 400, "auth");
      // Papago는 한 번에 한 문장 → 줄바꿈으로 묶어 보내고 다시 나눔
      const joined = texts.map((t) => t.replace(/\n/g, " ")).join("\n");
      const res = await fetchImpl("https://papago.apigw.ntruss.com/nmt/v1/translation", {
        method: "POST",
        headers: { "X-NCP-APIGW-API-KEY-ID": c.id, "X-NCP-APIGW-API-KEY": c.key, "Content-Type": "application/json" },
        body: JSON.stringify({ source: from ? PAPAGO_LANG[from] : "auto", target: PAPAGO_LANG[to], text: joined }),
      });
      if (!res.ok) throw mtError("papago", res.status, await readBody(res));
      const data = (await res.json()) as { message?: { result?: { translatedText?: string } } };
      const lines = (data.message?.result?.translatedText ?? "").split("\n");
      return texts.map((_, i) => (lines.length === texts.length ? lines[i] : i === 0 ? lines.join(" ") : "").trim());
    }
    case "google": {
      const c = creds.google;
      if (!c?.key) throw new MtError("Google Translate 키가 없어요.", 400, "auth");
      const out: string[] = [];
      for (let i = 0; i < texts.length; i += 100) {
        const chunk = texts.slice(i, i + 100);
        const res = await fetchImpl(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(c.key)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: chunk, target: GOOGLE_LANG[to], ...(from ? { source: GOOGLE_LANG[from] } : {}), format: "text" }),
        });
        if (!res.ok) throw mtError("google", res.status, await readBody(res));
        const data = (await res.json()) as { data?: { translations?: { translatedText: string }[] } };
        for (const t of data.data?.translations ?? []) out.push(t.translatedText ?? "");
      }
      return out;
    }
    case "deepl": {
      const c = creds.deepl;
      if (!c?.key) throw new MtError("DeepL 키가 없어요.", 400, "auth");
      const host = c.key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
      const out: string[] = [];
      for (let i = 0; i < texts.length; i += 50) {
        const chunk = texts.slice(i, i + 50);
        const res = await fetchImpl(`${host}/v2/translate`, {
          method: "POST",
          headers: { Authorization: `DeepL-Auth-Key ${c.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, target_lang: DEEPL_TARGET[to], ...(from ? { source_lang: DEEPL_SOURCE[from] } : {}) }),
        });
        if (!res.ok) throw mtError("deepl", res.status, await readBody(res));
        const data = (await res.json()) as { translations?: { text: string }[] };
        for (const t of data.translations ?? []) out.push(t.text ?? "");
      }
      return out;
    }
  }
}

/* --------------------------------- 사전 --------------------------------- */

export type DictSense = {
  /** 품사 (NOUN, ADJ, VERB …) */
  pos: string | null;
  /** 번역어 */
  text: string;
  confidence: number;
  /** 역번역: 이 번역어로 옮겨지는 원어들 (비슷한 말 찾기에 사용) */
  back: string[];
};

/** Azure 사전 조회 — 영↔한, 영↔중만 지원 (한 번에 최대 10단어) */
export async function azureDictionary(creds: MtCredentials, words: string[], from: MtLang, to: MtLang, fetchImpl: Fetch = fetch): Promise<DictSense[][]> {
  const c = creds.azure;
  if (!c?.key) throw new MtError("Azure Translator 키가 없어요.", 400, "auth");
  if (!words.length) return [];
  const qs = new URLSearchParams({ "api-version": "3.0", from: AZURE_LANG[from], to: AZURE_LANG[to] });
  const res = await fetchImpl(`https://api.cognitive.microsofttranslator.com/dictionary/lookup?${qs}`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": c.key,
      ...(c.region ? { "Ocp-Apim-Subscription-Region": c.region } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(words.slice(0, 10).map((Text) => ({ Text: Text.slice(0, 100) }))),
  });
  if (!res.ok) throw mtError("azure", res.status, await readBody(res));
  const data = (await res.json()) as {
    translations?: { displayTarget: string; posTag?: string; confidence?: number; backTranslations?: { displayText: string }[] }[];
  }[];
  return data.map((d) =>
    (d.translations ?? []).map((t) => ({
      pos: t.posTag && t.posTag !== "OTHER" ? t.posTag : null,
      text: t.displayTarget,
      confidence: t.confidence ?? 0,
      back: (t.backTranslations ?? []).map((b) => b.displayText).filter(Boolean),
    })),
  );
}

export function mtLangOf(lang: string): MtLang | null {
  return lang === "en" || lang === "ko" || lang === "zh" ? lang : null;
}

export const POS_LABEL: Record<string, string> = {
  NOUN: "명사",
  ADJ: "형용사",
  VERB: "동사",
  ADV: "부사",
  PRON: "대명사",
  PREP: "전치사",
  CONJ: "접속사",
  DET: "한정사",
  MODAL: "조동사",
};
