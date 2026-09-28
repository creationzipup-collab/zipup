import "server-only";

import { createHash } from "node:crypto";

import { and, eq, gte, inArray, like, sql } from "drizzle-orm";

import { maskSecret, seal, unseal } from "@/lib/crypto";
import { db } from "@/lib/db";
import { aiUsage, appSettings, lexiconCache } from "@/lib/db/schema";
import { badRequest, HttpError } from "@/lib/errors";
import { llmChat, llmProvider } from "@/lib/llm";
import { usdToMicros } from "@/lib/money";
import { alignSegments, parseJsonLoose, type Segment, splitPhrases } from "@/lib/prompt/align";
import type { PromptLang } from "@/lib/prompt/lang";
import { getSettings } from "@/lib/services/settings";
import type { CurrentUser } from "@/lib/session";
import { englishLemmas, glossaryByKorean, glossaryLookup, normalizeTerm } from "@/lib/translate/glossary";
import {
  azureDictionary,
  MT_FREE_CHARS,
  MT_PROVIDER_LABEL,
  MT_USD_PER_MILLION,
  type MtCredentials,
  MtError,
  type MtLang,
  type MtProviderId,
  mtTranslate,
  POS_LABEL,
} from "@/lib/translate/providers";

const PROVIDER_ORDER: MtProviderId[] = ["azure", "papago", "google", "deepl"];
export type MtMode = "auto" | MtProviderId | "llm" | "off";
export type Engine = MtProviderId | "llm" | "mock";

/* ------------------------------- 키·설정 ------------------------------- */

const SECRET_KEY = "translationKeys";

function envCreds(): MtCredentials {
  const e = (n: string) => process.env[n]?.trim() || undefined;
  const out: MtCredentials = {};
  if (e("AZURE_TRANSLATOR_KEY")) out.azure = { key: e("AZURE_TRANSLATOR_KEY")!, region: e("AZURE_TRANSLATOR_REGION") };
  if (e("PAPAGO_API_KEY_ID") && e("PAPAGO_API_KEY")) out.papago = { id: e("PAPAGO_API_KEY_ID")!, key: e("PAPAGO_API_KEY")! };
  if (e("GOOGLE_TRANSLATE_API_KEY")) out.google = { key: e("GOOGLE_TRANSLATE_API_KEY")! };
  if (e("DEEPL_API_KEY")) out.deepl = { key: e("DEEPL_API_KEY")! };
  return out;
}

async function storedCreds(): Promise<MtCredentials> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SECRET_KEY));
  if (!row || typeof row.value !== "string") return {};
  return unseal<MtCredentials>(row.value) ?? {};
}

let credCache: { at: number; value: { env: MtCredentials; stored: MtCredentials } } | null = null;

async function allCreds() {
  if (credCache && Date.now() - credCache.at < 15_000) return credCache.value;
  const value = { env: envCreds(), stored: await storedCreds() };
  credCache = { at: Date.now(), value };
  return value;
}

export type MtConfig = { mode: MtMode; engine: Engine | null; creds: MtCredentials };

export async function mtConfig(): Promise<MtConfig> {
  const [{ env, stored }, settings] = await Promise.all([allCreds(), getSettings()]);
  // 환경 변수에 있는 키가 우선
  const creds: MtCredentials = { ...stored, ...env };
  const mode = (settings.mtProvider ?? "auto") as MtMode;
  const llm = llmProvider();
  const llmEngine: Engine | null = llm ? (llm === "mock" ? "mock" : "llm") : null;
  let engine: Engine | null = null;
  if (mode === "off") engine = null;
  else if (mode === "llm") engine = llmEngine;
  else if (mode !== "auto") engine = creds[mode] ? mode : null;
  else engine = PROVIDER_ORDER.find((p) => creds[p]) ?? llmEngine;
  return { mode, engine, creds };
}

export function engineLabel(e: Engine | null): string {
  if (!e) return "없음";
  if (e === "llm") return "AI 번역";
  if (e === "mock") return "모의 번역";
  return MT_PROVIDER_LABEL[e];
}

/* ------------------------------ 캐시·기록 ------------------------------ */

const cacheKey = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex");

async function cacheGet(keys: string[]) {
  if (!keys.length) return new Map<string, unknown>();
  const rows = await db.select({ key: lexiconCache.key, result: lexiconCache.result }).from(lexiconCache).where(inArray(lexiconCache.key, keys));
  return new Map(rows.map((r) => [r.key, r.result]));
}

async function cachePut(rows: { key: string; kind: "mt" | "dict"; sourceLang: string; targetLang: string; source: string; result: unknown; provider: string }[]) {
  if (!rows.length) return;
  try {
    await db.insert(lexiconCache).values(rows).onConflictDoNothing();
  } catch (err) {
    console.error("[lexicon-cache] write failed", err);
  }
}

async function logUsage(userId: string, feature: string, model: string, costUsd: number, units = 0) {
  try {
    await db.insert(aiUsage).values({ userId, feature, model, costMicros: usdToMicros(costUsd), units });
  } catch (err) {
    console.error("[ai-usage] log failed", err);
  }
}

const hits = new Map<string, number[]>();
function rateLimit(userId: string, bucket: string, perMinute: number) {
  const k = `${bucket}:${userId}`;
  const now = Date.now();
  const list = (hits.get(k) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) throw new HttpError(429, "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", "rate_limited");
  list.push(now);
  hits.set(k, list);
}

function toHttp(err: unknown): never {
  if (err instanceof MtError) throw new HttpError(err.code === "rate" ? 429 : 502, err.message, `mt_${err.code}`);
  throw err;
}

/* ------------------------------ 문장 번역 ------------------------------ */

export type MtTranslateResult = { segments: Segment[]; cached: boolean; engine: Engine };

/**
 * 번역 API로 구간별 직역. 번역 API가 없거나 AI 번역 모드면 null (호출한 쪽이 AI 번역으로 처리).
 * 쉼표·마침표 단위로 나눠 구간마다 캐시하므로, 한 구간만 고치면 그 구간만 다시 번역해요.
 */
export async function mtTranslatePrompt(u: CurrentUser, text: string, lang: PromptLang): Promise<MtTranslateResult | null> {
  const cfg = await mtConfig();
  if (!cfg.engine || cfg.engine === "llm" || cfg.engine === "mock") return null;
  const engine = cfg.engine;
  const from: MtLang | null = lang === "en" ? "en" : lang === "zh" ? "zh" : null;
  const segs = alignSegments(
    text,
    splitPhrases(text).map((p) => ({ src: p.src, dst: "" })),
  );
  const todo = [...new Set(segs.map((s) => s.src).filter((s) => /\p{L}/u.test(s)))];
  const keyOf = (s: string) => cacheKey("mt1", from ?? "auto", "ko", s);
  const cached = await cacheGet(todo.map(keyOf));
  const missing = todo.filter((s) => typeof cached.get(keyOf(s)) !== "string");
  const fresh = new Map<string, string>();
  if (missing.length) {
    rateLimit(u.id, "mt", 60);
    const out = await mtTranslate(engine, cfg.creds, missing, from, "ko").catch(toHttp);
    missing.forEach((s, i) => fresh.set(s, out[i] ?? ""));
    await cachePut(missing.filter((s) => fresh.get(s)).map((s) => ({ key: keyOf(s), kind: "mt", sourceLang: from ?? "auto", targetLang: "ko", source: s, result: fresh.get(s)!, provider: engine })));
    await logUsage(u.id, "mt-translate", engine, 0, missing.reduce((n, s) => n + s.length, 0));
  }
  const segments = segs.map((s) => ({ ...s, dst: fresh.get(s.src) ?? (cached.get(keyOf(s.src)) as string | undefined) ?? "" }));
  return { segments, cached: missing.length === 0, engine };
}

/** 한국어 프롬프트를 영어·중국어로 (번역 API가 있으면 사용, 없으면 null) */
export async function mtConvert(u: CurrentUser, text: string, target: "en" | "zh"): Promise<{ text: string; engine: Engine } | null> {
  const cfg = await mtConfig();
  if (!cfg.engine || cfg.engine === "llm" || cfg.engine === "mock") return null;
  const engine = cfg.engine;
  rateLimit(u.id, "mt", 60);
  // 줄 단위로 보내 줄바꿈을 유지
  const lines = text.split("\n");
  const idx = lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
  const out = await mtTranslate(engine, cfg.creds, idx.map((i) => lines[i]), null, target).catch(toHttp);
  idx.forEach((li, k) => (lines[li] = out[k] ?? lines[li]));
  await logUsage(u.id, `mt-convert-${target}`, engine, 0, text.length);
  return { text: lines.join("\n"), engine };
}

/* ------------------------------ 단어 뜻 ------------------------------ */

export type WordSense = { pos: string | null; ko: string[] };
export type WordLookup = {
  query: string;
  lang: "en" | "zh";
  source: "glossary" | "dictionary" | "mt" | "llm" | "mock" | "none";
  senses: WordSense[];
  note?: string;
  /** 비슷한 영어 표현 */
  alternatives: string[];
  /** 중국어 단어의 영어 뜻 */
  en?: string[];
  engine: string;
  /** 뜻을 못 찾았을 때 안내 */
  hint?: string;
};

const NO_ENGINE_HINT = "번역 엔진이 연결되지 않았어요. 관리자 → 설정 → 번역·사전 엔진에서 무료 Azure 키를 넣으면 모든 단어 뜻이 나와요.";

function groupSenses(list: { pos: string | null; text: string; confidence: number }[], perPos = 4, maxPos = 3): WordSense[] {
  const byPos = new Map<string, { ko: string[]; score: number }>();
  for (const s of [...list].sort((a, b) => b.confidence - a.confidence)) {
    const pos = s.pos ? (POS_LABEL[s.pos] ?? s.pos.toLowerCase()) : "";
    const g = byPos.get(pos) ?? { ko: [], score: 0 };
    if (!g.ko.includes(s.text) && g.ko.length < perPos) g.ko.push(s.text);
    g.score += s.confidence;
    byPos.set(pos, g);
  }
  return [...byPos.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, maxPos)
    .map(([pos, g]) => ({ pos: pos || null, ko: g.ko }));
}

const WORD_RE = /^[\p{L}\p{N}][\p{L}\p{N}'’\-./: ]{0,58}$/u;

export async function lookupWord(u: CurrentUser, rawQ: string, lang: "en" | "zh"): Promise<WordLookup> {
  const q = rawQ.replace(/\s+/g, " ").trim();
  if (!q || !WORD_RE.test(q) || q.split(" ").length > 5) throw badRequest("단어나 짧은 표현을 골라 주세요.");
  const key = lang === "en" ? normalizeTerm(q) : q;

  if (lang === "en") {
    const g = glossaryLookup(q);
    if (g) return { query: q, lang, source: "glossary", senses: [{ pos: null, ko: g.ko }], note: g.note, alternatives: g.forms.slice(1, 4).filter((f) => f.length > 3), engine: "용어집" };
  }

  const ck = cacheKey("dict1", lang, "ko", key);
  const cached = (await cacheGet([ck])).get(ck) as WordLookup | undefined;
  if (cached) return cached;

  rateLimit(u.id, "lookup", 240);
  const cfg = await mtConfig();
  let result: WordLookup | null = null;

  try {
    if (cfg.creds.azure && cfg.engine !== "llm" && cfg.mode !== "off") {
      if (lang === "en") {
        // 원형으로도 찾아봄 (walking → walk)
        const tries = [q, ...englishLemmas(q).filter((l) => l !== q.toLowerCase())].slice(0, 4);
        const res = await azureDictionary(cfg.creds, tries, "en", "ko");
        await logUsage(u.id, "mt-lookup", "azure", 0, tries.join("").length);
        const found = res.find((r) => r.length) ?? [];
        if (found.length) {
          const alternatives = [...new Set(found.slice(0, 3).flatMap((s) => s.back))].filter((w) => w.toLowerCase() !== q.toLowerCase()).slice(0, 6);
          result = { query: q, lang, source: "dictionary", senses: groupSenses(found), alternatives, engine: "Azure 사전" };
        }
      } else {
        const [en] = await azureDictionary(cfg.creds, [q], "zh", "en");
        const [ko] = await mtTranslate("azure", cfg.creds, [q], "zh", "ko");
        await logUsage(u.id, "mt-lookup", "azure", 0, q.length * 2);
        result = {
          query: q,
          lang,
          source: "dictionary",
          senses: ko ? [{ pos: null, ko: [ko] }] : [],
          alternatives: [],
          en: (en ?? []).slice(0, 5).map((s) => s.text),
          engine: "Azure 사전",
        };
      }
    }
    if (!result && cfg.engine && cfg.engine !== "llm" && cfg.engine !== "mock") {
      const [ko] = await mtTranslate(cfg.engine, cfg.creds, [q], lang, "ko");
      await logUsage(u.id, "mt-lookup", cfg.engine, 0, q.length);
      if (ko) result = { query: q, lang, source: "mt", senses: [{ pos: null, ko: [ko] }], alternatives: [], engine: engineLabel(cfg.engine) };
    }
  } catch (err) {
    if (!(err instanceof MtError)) throw err;
    // 번역 API가 막히면 AI로 한 번 더 시도
    if (!llmProvider()) toHttp(err);
  }

  let llmError: string | null = null;
  if (!result && (cfg.engine === "llm" || cfg.engine === "mock" || llmProvider())) {
    const res = await llmChat({
      system: "You are a concise English/Chinese→Korean dictionary for creative video and image production. Reply with JSON only.",
      user: `Word or phrase (${lang === "zh" ? "Chinese" : "English"}): "${q}"
Give up to 3 part-of-speech groups with 1–4 short Korean meanings each (most common first; prefer film/photo/3D meanings when relevant), and up to 4 close English alternatives.
JSON: {"senses":[{"pos":"명사|형용사|동사|부사|null","ko":["..."]}],"alternatives":["..."]}`,
      json: true,
      maxTokens: 300,
      temperature: 0,
      model: (await getSettings()).llmModel || null,
      mock: () => JSON.stringify({ senses: [{ pos: "명사", ko: [`〔모의〕 ${q}의 뜻`] }], alternatives: [] }),
    }).catch((err: Error) => {
      llmError = err.message;
      return null;
    });
    const parsed = res ? parseJsonLoose<{ senses?: { pos?: string | null; ko?: string[] }[]; alternatives?: string[] }>(res.text) : null;
    const senses = (parsed?.senses ?? [])
      .map((s) => ({ pos: s.pos && s.pos !== "null" ? String(s.pos) : null, ko: (s.ko ?? []).map(String).filter(Boolean).slice(0, 4) }))
      .filter((s) => s.ko.length)
      .slice(0, 3);
    if (res) await logUsage(u.id, "lookup", res.model, res.costUsd);
    if (res && senses.length) {
      result = {
        query: q,
        lang,
        source: res.provider === "mock" ? "mock" : "llm",
        senses,
        alternatives: (parsed?.alternatives ?? []).map(String).slice(0, 4),
        engine: res.provider === "mock" ? "모의" : "AI",
      };
    }
  }

  if (!result) {
    return { query: q, lang, source: "none", senses: [], alternatives: [], engine: "없음", hint: llmError ? `${llmError} ${NO_ENGINE_HINT}` : cfg.engine ? undefined : NO_ENGINE_HINT };
  }
  if (result.source !== "mock") {
    await cachePut([{ key: ck, kind: "dict", sourceLang: lang, targetLang: "ko", source: key, result, provider: result.source }]);
  }
  return result;
}

/* --------------------------- 한→영 단어 추천 --------------------------- */

export type WordCandidate = { text: string; ko: string; note?: string; source: "glossary" | "dictionary" | "mt" | "llm" | "mock" };

/**
 * 한국어로 원하는 뜻을 적으면 프롬프트에 바로 넣을 영어(또는 중국어) 표현 후보를 줘요.
 * 용어집 → 사전(Azure) → 번역 API 순서로 모으고, 3개가 안 되면 AI로 보충해요.
 */
export async function suggestWords(
  u: CurrentUser,
  input: { ko: string; original?: string | null; target?: "en" | "zh" },
): Promise<{ items: WordCandidate[]; engine: string }> {
  const ko = input.ko.replace(/\s+/g, " ").trim();
  if (!ko || ko.length > 200) throw badRequest("바꿀 뜻을 한국어로 적어 주세요. (200자까지)");
  // 사전은 짧은 단어에만 (긴 구절은 번역으로)
  const wordLike = ko.length <= 30 && ko.split(" ").length <= 3;
  const target = input.target ?? "en";
  const original = input.original?.trim().toLowerCase() ?? "";
  const items: WordCandidate[] = [];
  const seen = new Set<string>([original]);
  const add = (c: WordCandidate) => {
    const k = c.text.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    items.push({ ...c, text: c.text.trim() });
  };
  const engines = new Set<string>();

  if (target === "en" && wordLike) {
    for (const e of glossaryByKorean(ko, 5)) add({ text: e.en, ko: e.ko.slice(0, 2).join(", "), note: e.note, source: "glossary" });
    if (items.length) engines.add("용어집");
  }

  const ck = cacheKey("sug1", target, ko);
  const cached = (await cacheGet([ck])).get(ck) as WordCandidate[] | undefined;
  if (cached) {
    for (const c of cached) add(c);
  } else {
    rateLimit(u.id, "suggest", 60);
    const cfg = await mtConfig();
    const found: WordCandidate[] = [];
    try {
      if (target === "en" && wordLike && cfg.creds.azure && cfg.engine !== "llm" && cfg.mode !== "off") {
        const [senses] = await azureDictionary(cfg.creds, [ko], "ko", "en");
        await logUsage(u.id, "mt-suggest", "azure", 0, ko.length);
        for (const s of (senses ?? []).slice(0, 6)) found.push({ text: s.text, ko: s.back.slice(0, 2).join(", ") || ko, source: "dictionary" });
        if (found.length) engines.add("Azure 사전");
      }
      if (cfg.engine && cfg.engine !== "llm" && cfg.engine !== "mock") {
        const [out] = await mtTranslate(cfg.engine, cfg.creds, [ko], "ko", target);
        await logUsage(u.id, "mt-suggest", cfg.engine, 0, ko.length);
        if (out) {
          found.push({ text: out.replace(/[.。]$/, ""), ko, source: "mt" });
          engines.add(engineLabel(cfg.engine));
        }
      }
    } catch (err) {
      if (!(err instanceof MtError)) throw err;
      if (!llmProvider()) toHttp(err);
    }
    for (const c of found) add(c);

    if (items.length < 3 && llmProvider()) {
      const lang = target === "zh" ? "Simplified Chinese" : "English";
      const res = await llmChat({
        system: "You help Korean creatives write prompts for AI image and video models. Reply with JSON only.",
        user: `Korean meaning: "${ko}"${original ? `\nIt will replace the word "${input.original}" in the prompt.` : ""}
Give 4 different ${lang} words or short phrases for it, most literal first, then more vivid or cinematic. For each add "ko": a literal Korean gloss.
JSON: {"items":[{"text":"...","ko":"..."}]}`,
        json: true,
        maxTokens: 300,
        temperature: 0.4,
        model: (await getSettings()).llmModel || null,
        mock: () => JSON.stringify({ items: [{ text: `mock ${ko}`, ko }, { text: "vivid", ko: "생생한" }, { text: "cinematic", ko: "영화 같은" }] }),
      }).catch((err: Error) => {
        if (!items.length) throw new HttpError(502, `${err.message} ${NO_ENGINE_HINT}`, "suggest_unavailable");
        return null;
      });
      if (res) {
        const parsed = parseJsonLoose<{ items?: { text?: string; ko?: string }[] }>(res.text);
        const src = res.provider === "mock" ? "mock" : "llm";
        for (const it of parsed?.items ?? []) if (it?.text) add({ text: String(it.text), ko: String(it.ko ?? ko), source: src });
        await logUsage(u.id, "suggest-words", res.model, res.costUsd);
        engines.add(src === "mock" ? "모의" : "AI");
        found.push(...items.filter((c) => c.source === "llm"));
      }
    } else if (!items.length && !llmProvider()) {
      throw new HttpError(503, NO_ENGINE_HINT, "suggest_unavailable");
    }
    if (found.length && !found.some((c) => c.source === "mock")) {
      await cachePut([{ key: ck, kind: "dict", sourceLang: "ko", targetLang: target, source: ko, result: found, provider: [...engines].join("+") }]);
    }
  }
  return { items: items.slice(0, 8), engine: [...engines].join(" · ") || "없음" };
}

/* ------------------------------ 관리자 화면 ------------------------------ */

export type TranslationStatus = {
  mode: MtMode;
  engine: Engine | null;
  engineLabel: string;
  providers: {
    id: MtProviderId;
    label: string;
    configured: boolean;
    fromEnv: boolean;
    masked: string | null;
    region?: string | null;
    freeChars: number;
    usdPerMillion: number;
  }[];
  usage: { provider: string; chars: number }[];
  llm: string | null;
};

function monthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function translationStatus(): Promise<TranslationStatus> {
  const [{ env, stored }, cfg] = await Promise.all([allCreds(), mtConfig()]);
  const rows = await db
    .select({ provider: aiUsage.model, chars: sql<number>`coalesce(sum(${aiUsage.units}), 0)::int` })
    .from(aiUsage)
    .where(and(like(aiUsage.feature, "mt-%"), gte(aiUsage.createdAt, monthStart())))
    .groupBy(aiUsage.model);
  const secretOf = (p: MtProviderId, c: MtCredentials) => {
    const v = c[p];
    if (!v) return null;
    return "id" in v ? `${maskSecret(v.id)} / ${maskSecret(v.key)}` : maskSecret(v.key);
  };
  return {
    mode: cfg.mode,
    engine: cfg.engine,
    engineLabel: engineLabel(cfg.engine),
    providers: PROVIDER_ORDER.map((id) => ({
      id,
      label: MT_PROVIDER_LABEL[id],
      configured: !!(env[id] || stored[id]),
      fromEnv: !!env[id],
      masked: secretOf(id, env[id] ? env : stored),
      region: id === "azure" ? ((env.azure ?? stored.azure)?.region ?? null) : undefined,
      freeChars: MT_FREE_CHARS[id],
      usdPerMillion: MT_USD_PER_MILLION[id],
    })),
    usage: rows.map((r) => ({ provider: r.provider, chars: Number(r.chars) })),
    llm: llmProvider(),
  };
}

export type KeyPatch = {
  azure?: { key: string; region?: string | null } | null;
  papago?: { id: string; key: string } | null;
  google?: { key: string } | null;
  deepl?: { key: string } | null;
};

/** 관리자가 입력한 키 저장 (null이면 삭제). 저장 전에 짧은 번역으로 키를 확인해요. */
export async function saveTranslationKeys(patch: KeyPatch, userId: string): Promise<void> {
  const current = await storedCreds();
  const next: MtCredentials = { ...current };
  for (const id of PROVIDER_ORDER) {
    if (!(id in patch)) continue;
    const v = patch[id];
    if (v === null) {
      delete next[id];
      continue;
    }
    if (!v) continue;
    const creds = { [id]: v } as MtCredentials;
    if (id === "azure" && creds.azure) creds.azure.region = creds.azure.region?.trim() || undefined;
    try {
      await mtTranslate(id, creds, ["test"], "en", "ko");
    } catch (err) {
      if (err instanceof MtError) throw new HttpError(400, `저장하지 않았어요 — ${err.message}`, "mt_key_invalid");
      throw err;
    }
    Object.assign(next, creds);
  }
  const value = seal(next);
  await db
    .insert(appSettings)
    .values({ key: SECRET_KEY, value, updatedBy: userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId } });
  credCache = null;
}

/** 캐시 비우기 (번역 품질이 바뀌었을 때) */
export async function clearLexiconCache(): Promise<number> {
  const res = await db.delete(lexiconCache).where(eq(lexiconCache.kind, "mt")).returning({ key: lexiconCache.key });
  return res.length;
}
