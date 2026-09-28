"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import type { GenerationDTO } from "@/lib/services/generation";
import { ACTIVE_STATUSES } from "@/lib/types";
import { fetchJson } from "@/lib/utils";

export type { GenerationDTO };

export const ACTIVE_KEY = ["generations", "active"] as const;

export function isActive(g: Pick<GenerationDTO, "status">) {
  return ACTIVE_STATUSES.includes(g.status);
}

/** 진행 중 작업 (전역 공유, 진행 중이면 2.5초 간격 폴링) */
export function useActiveGenerations() {
  return useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: () => fetchJson<{ items: GenerationDTO[] }>("/api/generations/active").then((r) => r.items),
    refetchInterval: (q) => ((q.state.data ?? []).some(isActive) ? 2500 : 20_000),
    refetchIntervalInBackground: true,
    staleTime: 1000,
  });
}

/** 새로 만든 작업을 즉시 목록에 반영 */
export function usePushGenerations() {
  const qc = useQueryClient();
  return React.useCallback(
    (items: GenerationDTO[]) => {
      qc.setQueryData<GenerationDTO[]>(ACTIVE_KEY, (prev) => {
        const map = new Map((prev ?? []).map((g) => [g.id, g]));
        for (const g of items) map.set(g.id, g);
        return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
      void qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    [qc],
  );
}

export async function createGenerationRequest(body: {
  modelId: string;
  prompt: string;
  params: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  count?: number;
  projectId?: string | null;
  canvasId?: string | null;
  canvasNodeId?: string | null;
}) {
  return fetchJson<{ batchId: string; projectId: string; generations: GenerationDTO[] }>("/api/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function cancelGenerationRequest(id: string) {
  return fetchJson<{ canceled: boolean }>(`/api/generations/${id}`, { method: "DELETE" });
}
