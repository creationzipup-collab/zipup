"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { ColorLabel, Flag } from "@/lib/types";
import { fetchJson } from "@/lib/utils";

export type AssetPatch = {
  rating?: number;
  flag?: Flag | null;
  colorLabel?: ColorLabel | null;
  addTags?: string[];
  removeTags?: string[];
  favorite?: boolean;
  projectId?: string;
  deleted?: boolean;
};

export function useAssetMutations() {
  const qc = useQueryClient();
  const update = React.useCallback(
    async (ids: string[], patch: AssetPatch, opts: { silent?: boolean } = {}) => {
      try {
        await fetchJson("/api/assets", { method: "PATCH", body: JSON.stringify({ ids, patch }) });
        void qc.invalidateQueries({ queryKey: ["assets"] });
        void qc.invalidateQueries({ queryKey: ["asset"] });
        void qc.invalidateQueries({ queryKey: ["generations"] });
        return true;
      } catch (e) {
        if (!opts.silent) toast.error((e as Error).message);
        return false;
      }
    },
    [qc],
  );
  return { update };
}

/** 다운로드 (서명된 URL, 자동 파일명) */
export function downloadUrl(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 여러 파일을 ZIP으로 (브라우저에서 스트리밍 압축) */
export async function downloadZip(items: { url: string; filename: string }[], zipName: string) {
  const { downloadZip: dz } = await import("client-zip");
  const used = new Set<string>();
  const files = async function* () {
    for (const it of items) {
      let name = it.filename;
      let i = 1;
      while (used.has(name)) name = it.filename.replace(/(\.[^.]+)?$/, `_${++i}$1`);
      used.add(name);
      const res = await fetch(it.url);
      if (!res.ok) continue;
      yield { name, input: res, lastModified: new Date() };
    }
  };
  const blob = await dz(files()).blob();
  const url = URL.createObjectURL(blob);
  downloadUrl(url, zipName);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
