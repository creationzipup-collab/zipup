import type { StorageDriver } from "./types";

/**
 * Supabase Storage 드라이버 (REST API + service role / secret 키).
 * DB와 같은 Supabase 프로젝트를 쓰므로 별도 스토리지 가입이 필요 없어요.
 *
 * - 서명 URL은 Supabase에 요청해야 만들어지므로, 같은 틱에 들어온 요청을 모아 한 번에 서명하고
 *   인스턴스 안에서 1시간 동안 재사용해요 (같은 URL → 브라우저 캐시 적중).
 * - 버킷은 처음 쓸 때 비공개로 자동 생성해요.
 */
export type SupabaseStorageConfig = {
  url: string;
  key: string;
  bucket: string;
  fetch?: typeof fetch;
};

export class SupabaseStorageError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Supabase Storage 오류 (${status}): ${summarize(body)}`);
  }
}

function summarize(body: string): string {
  try {
    const j = JSON.parse(body) as { message?: string; error?: string };
    return j.message || j.error || body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

const HOUR = 3600;
const SIGN_CHUNK = 200;
const CACHE_MAX = 5000;

type Pending = { key: string; resolve: (url: string) => void; reject: (err: unknown) => void };

export function createSupabaseDriver(cfg: SupabaseStorageConfig): StorageDriver {
  const base = `${cfg.url.replace(/\/+$/, "")}/storage/v1`;
  const doFetch = cfg.fetch ?? fetch;
  const bucket = cfg.bucket;
  // 새 형식 키(sb_secret_…)는 apikey 헤더로만 보내고, 예전 service_role 키(JWT)는 Authorization에도 넣어요
  const auth: Record<string, string> = cfg.key.startsWith("eyJ") ? { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } : { apikey: cfg.key };
  const objectPath = (key: string) => `${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;

  async function call(path: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit; json?: unknown } = {}) {
    const headers: Record<string, string> = { ...auth, ...init.headers };
    let body = init.body;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    }
    const res = await doFetch(`${base}${path}`, { method: init.method ?? "GET", headers, body, cache: "no-store" });
    if (!res.ok) throw new SupabaseStorageError(res.status, await res.text().catch(() => ""));
    return res;
  }

  let bucketReady: Promise<void> | null = null;
  function ensureBucket(): Promise<void> {
    bucketReady ??= (async () => {
      const found = await doFetch(`${base}/bucket/${encodeURIComponent(bucket)}`, { headers: auth, cache: "no-store" });
      if (found.ok) return;
      const text = await found.text().catch(() => "");
      if (found.status === 401 || found.status === 403 || /invalid|jwt|unauthorized/i.test(summarize(text))) throw new SupabaseStorageError(found.status, text);
      try {
        await call("/bucket", { method: "POST", json: { id: bucket, name: bucket, public: false } });
      } catch (err) {
        // 동시에 다른 인스턴스가 만들었으면 괜찮아요
        if (!(err instanceof SupabaseStorageError && /already exists|duplicate/i.test(err.body))) throw err;
      }
    })().catch((err) => {
      bucketReady = null;
      throw err;
    });
    return bucketReady;
  }

  /* ------------------------------ 서명 URL (묶음) ------------------------------ */

  const cache = new Map<string, { url: string; until: number }>();
  const queues = new Map<number, Pending[]>();
  let scheduled = false;

  function remember(cacheKey: string, url: string) {
    if (cache.size >= CACHE_MAX) {
      let drop = cache.size - CACHE_MAX + 500;
      for (const k of cache.keys()) {
        if (drop-- <= 0) break;
        cache.delete(k);
      }
    }
    cache.set(cacheKey, { url, until: Date.now() + HOUR * 1000 });
  }

  async function signChunk(expiresIn: number, items: Pending[]) {
    const paths = [...new Set(items.map((i) => i.key))];
    try {
      const res = await call(`/object/sign/${encodeURIComponent(bucket)}`, { method: "POST", json: { expiresIn: expiresIn + HOUR, paths } });
      const data = (await res.json()) as { path?: string | null; signedURL?: string | null; error?: string | null }[];
      const byPath = new Map<string, string>();
      for (const d of data) if (d.path && d.signedURL) byPath.set(d.path, encodeURI(`${base}${d.signedURL}`));
      for (const it of items) {
        const url = byPath.get(it.key);
        if (url) remember(`${expiresIn}|${it.key}`, url);
        // 없는 파일은 빈 문자열 (S3에서 404가 나는 것과 같은 상황)
        it.resolve(url ?? "");
      }
    } catch (err) {
      for (const it of items) it.reject(err);
    }
  }

  function flush() {
    scheduled = false;
    const batches = [...queues.entries()];
    queues.clear();
    for (const [expiresIn, items] of batches) {
      for (let i = 0; i < items.length; i += SIGN_CHUNK) void signChunk(expiresIn, items.slice(i, i + SIGN_CHUNK));
    }
  }

  function signed(key: string, expiresIn: number): Promise<string> {
    const hit = cache.get(`${expiresIn}|${key}`);
    if (hit && hit.until > Date.now()) return Promise.resolve(hit.url);
    return new Promise((resolve, reject) => {
      const q = queues.get(expiresIn) ?? [];
      q.push({ key, resolve, reject });
      queues.set(expiresIn, q);
      if (!scheduled) {
        scheduled = true;
        setTimeout(flush, 0);
      }
    });
  }

  return {
    kind: "supabase",
    async put(key, body, contentType) {
      await ensureBucket();
      await call(`/object/${objectPath(key)}`, {
        method: "POST",
        headers: { "Content-Type": contentType, "cache-control": "max-age=31536000", "x-upsert": "true" },
        body: new Uint8Array(body),
      });
    },
    async get(key) {
      const res = await call(`/object/authenticated/${objectPath(key)}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(key) {
      await call(`/object/${encodeURIComponent(bucket)}`, { method: "DELETE", json: { prefixes: [key] } });
      for (const k of cache.keys()) if (k.endsWith(`|${key}`)) cache.delete(k);
    },
    async signedGetUrl(key, opts = {}) {
      const url = await signed(key, opts.expiresIn ?? 2 * HOUR);
      if (!url || !opts.downloadName) return url;
      return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(opts.downloadName)}`;
    },
    async signedPutUrl(key, contentType) {
      await ensureBucket();
      // Supabase의 업로드용 서명 URL은 2시간 유효해요
      const res = await call(`/object/upload/sign/${objectPath(key)}`, { method: "POST", json: {} });
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error("업로드 주소를 받지 못했어요. 잠시 후 다시 시도해 주세요.");
      return { url: new URL(`${base}${data.url}`).toString(), headers: { "Content-Type": contentType } };
    },
  };
}
