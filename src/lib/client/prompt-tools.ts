"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { useDebounced } from "@/lib/client/use-debounced";
import type { Segment } from "@/lib/prompt/align";
import { detectLang, type PromptLang } from "@/lib/prompt/lang";
import type { PromptDocDTO, PromptVersionDTO } from "@/lib/services/prompt-docs";
import type { Suggestion, TranslateResult } from "@/lib/services/prompt-tools";
import { fetchJson } from "@/lib/utils";

export type { PromptDocDTO, PromptVersionDTO, Segment, Suggestion, TranslateResult };

const translateKey = (text: string) => ["prompt-translate", text] as const;

/** 영어·중국어 프롬프트의 한국어 대조 번역 (입력이 멈추면 자동, 서버 캐시) */
export function useTranslation(text: string, enabled: boolean) {
  const debounced = useDebounced(text, 900);
  const lang: PromptLang = detectLang(text);
  const wanted = enabled && debounced.trim().length > 2 && ["en", "zh", "mixed"].includes(detectLang(debounced));
  const q = useQuery({
    queryKey: translateKey(debounced),
    queryFn: () => fetchJson<TranslateResult>("/api/prompt-tools/translate", { method: "POST", body: JSON.stringify({ text: debounced }) }),
    enabled: wanted,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
  return {
    lang,
    data: q.data,
    error: q.error as (Error & { status?: number }) | null,
    loading: wanted && (q.isFetching || debounced !== text),
    stale: debounced !== text,
    refetch: q.refetch,
  };
}

/** 추천을 적용한 뒤 새 문장의 번역을 미리 넣어 두어 다시 번역하지 않게 */
export function usePrimeTranslation() {
  const qc = useQueryClient();
  return React.useCallback((text: string, data: TranslateResult) => qc.setQueryData(translateKey(text), data), [qc]);
}

export function requestSuggestions(body: { prompt: string; src: string; dst: string; editedKo?: string | null; focusKo?: string | null; count?: number }) {
  return fetchJson<{ suggestions: Suggestion[]; mock: boolean }>("/api/prompt-tools/suggest", { method: "POST", body: JSON.stringify(body) });
}

export function convertPromptRequest(text: string, target: "en" | "zh") {
  return fetchJson<{ text: string; mock: boolean }>("/api/prompt-tools/convert", { method: "POST", body: JSON.stringify({ text, target }) });
}

export function usePromptVersions(docId: string | null | undefined) {
  return useQuery({
    queryKey: ["prompt-versions", docId],
    queryFn: () => fetchJson<{ items: PromptVersionDTO[] }>(`/api/prompts/${docId}/versions`).then((r) => r.items),
    enabled: !!docId,
    staleTime: 10_000,
  });
}
