"use client";

import { useQuery } from "@tanstack/react-query";

import type { PromptLang } from "@/lib/prompt/lang";
import type { WordCandidate, WordLookup } from "@/lib/services/translate";
import { glossaryLookup, glossaryPhraseAt, tokenizeEnglish, type WordToken } from "@/lib/translate/glossary";
import { fetchJson } from "@/lib/utils";

export type { WordCandidate, WordLookup };

export type LexLang = "en" | "zh";

const HANGUL = /[가-힣ㄱ-ㆎ]/;
const HAN = /[㐀-䶿一-鿿]/;

/** 단어 단위로 나누기 — 중국어가 섞이면 브라우저 형태소 분리(Intl.Segmenter) 사용 */
export function wordTokens(text: string, lang: PromptLang): WordToken[] {
  if ((lang === "zh" || lang === "mixed") && typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("zh", { granularity: "word" });
    const out: WordToken[] = [];
    for (const s of seg.segment(text)) if (s.isWordLike) out.push({ text: s.segment, start: s.index, end: s.index + s.segment.length });
    return out;
  }
  return tokenizeEnglish(text);
}

/** 이 단어는 어떤 언어로 찾을지 (한국어 단어는 대상 아님) */
export function lexLangOf(word: string): LexLang | null {
  if (HANGUL.test(word)) return null;
  if (HAN.test(word)) return "zh";
  return /[A-Za-z]/.test(word) ? "en" : null;
}

/** 마우스를 올린 단어가 속한 표현(용어집의 여러 단어 표현 우선) */
export function phraseAt(tokens: WordToken[], index: number, text: string): { start: number; end: number; q: string; lang: LexLang } | null {
  const t = tokens[index];
  if (!t) return null;
  const lang = lexLangOf(t.text);
  if (!lang) return null;
  if (lang === "en") {
    const hit = glossaryPhraseAt(tokens, index, text);
    if (hit) return { start: hit.start, end: hit.end, q: text.slice(hit.start, hit.end), lang };
  }
  return { start: t.start, end: t.end, q: t.text, lang };
}

function localLookup(q: string, lang: LexLang): WordLookup | null {
  if (lang !== "en") return null;
  const g = glossaryLookup(q);
  if (!g) return null;
  return {
    query: q,
    lang,
    source: "glossary",
    senses: [{ pos: null, ko: g.ko }],
    note: g.note,
    alternatives: g.forms.slice(1, 4).filter((f) => f.length > 3),
    engine: "용어집",
  };
}

/** 단어 뜻 — 용어집에 있으면 바로, 없으면 서버(사전·번역 API, 회사 공용 캐시) */
export function useWordLookup(q: string | null, lang: LexLang) {
  const local = q ? localLookup(q, lang) : null;
  const query = useQuery({
    queryKey: ["word-lookup", lang, q?.toLowerCase()],
    queryFn: () => fetchJson<WordLookup>(`/api/prompt-tools/lookup?q=${encodeURIComponent(q!)}&lang=${lang}`),
    enabled: !!q && !local,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  return { data: local ?? query.data, loading: !local && query.isFetching, error: query.error as Error | null };
}

export function requestWordCandidates(body: { ko: string; original?: string | null; target?: LexLang }) {
  return fetchJson<{ items: WordCandidate[]; engine: string }>("/api/prompt-tools/words", { method: "POST", body: JSON.stringify(body) });
}

/** 원래 단어가 대문자로 시작했으면 바꿀 표현도 맞춰 줌 */
export function matchCase(original: string, next: string): string {
  if (/^[A-Z]/.test(original) && /^[a-z]/.test(next)) return next[0].toUpperCase() + next.slice(1);
  return next;
}

export function naverDictUrl(q: string, lang: LexLang) {
  return lang === "zh"
    ? `https://zh.dict.naver.com/#/search?query=${encodeURIComponent(q)}`
    : `https://en.dict.naver.com/#/search?query=${encodeURIComponent(q)}`;
}
