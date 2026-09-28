"use client";

import { UPLOAD_TYPES } from "@/lib/uploads";
import { fetchJson } from "@/lib/utils";

export type UploadedAsset = {
  id: string;
  kind: "image" | "video";
  filename: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  projectId: string;
  urls: { thumb: string; src: string; download: string };
};

function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress?: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`업로드 실패 (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("업로드 중 네트워크 오류가 발생했어요. (스토리지 CORS 설정을 확인하세요)"));
    xhr.send(file);
  });
}

/** 파일 업로드 → 에셋 생성 */
export async function uploadFile(file: File, opts: { projectId?: string | null; onProgress?: (p: number) => void } = {}): Promise<UploadedAsset> {
  const contentType = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!UPLOAD_TYPES[contentType]) throw new Error(`${file.name}: 지원하지 않는 형식이에요.`);
  const presign = await fetchJson<{ key: string; url: string; headers: Record<string, string> }>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType, size: file.size }),
  });
  await putWithProgress(presign.url, file, presign.headers, opts.onProgress);
  const done = await fetchJson<{ asset: UploadedAsset }>("/api/uploads/complete", {
    method: "POST",
    body: JSON.stringify({ key: presign.key, filename: file.name, contentType, projectId: opts.projectId ?? null }),
  });
  return done.asset;
}

/** 클립보드/드래그 데이터에서 파일 추출 */
export function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  if (dt.files?.length) for (const f of Array.from(dt.files)) out.push(f);
  else if (dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}
