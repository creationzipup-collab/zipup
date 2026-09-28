import { describe, expect, it } from "vitest";

import { createSupabaseDriver } from "./supabase";

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** Supabase Storage REST API 흉내 */
function fakeSupabase(opts: { bucketExists?: boolean } = {}) {
  const calls: Call[] = [];
  let bucketExists = opts.bucketExists ?? true;
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = init.headers as Record<string, string>;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, url, headers, body });
    const path = url.replace("https://proj.supabase.co/storage/v1", "");
    if (method === "GET" && path.startsWith("/bucket/")) {
      return bucketExists ? json(200, { id: "zipup-ai" }) : json(400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
    }
    if (method === "POST" && path === "/bucket") {
      bucketExists = true;
      return json(200, { name: "zipup-ai" });
    }
    if (method === "POST" && path === "/object/sign/zipup-ai") {
      const { paths } = body as { paths: string[] };
      return json(
        200,
        paths.map((p) => (p.includes("missing") ? { path: p, signedURL: null, error: "Either the object does not exist or you do not have access to it" } : { path: p, signedURL: `/object/sign/zipup-ai/${p}?token=t-${p}`, error: null })),
      );
    }
    if (method === "POST" && path.startsWith("/object/upload/sign/")) {
      return json(200, { url: `${path}?token=up`, token: "up" });
    }
    if (method === "POST" && path.startsWith("/object/zipup-ai/")) return json(200, { Key: path });
    if (method === "GET" && path.startsWith("/object/authenticated/")) return new Response(new Uint8Array([1, 2, 3]));
    if (method === "DELETE" && path === "/object/zipup-ai") return json(200, []);
    return json(404, { message: "unexpected" });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("Supabase storage driver", () => {
  it("signs every URL requested in the same tick with one request and reuses them", async () => {
    const { calls, fetchImpl } = fakeSupabase();
    const d = createSupabaseDriver({ url: "https://proj.supabase.co/", key: "sb_secret_x", bucket: "zipup-ai", fetch: fetchImpl });
    const [a, thumb, dl] = await Promise.all([
      d.signedGetUrl("assets/p/1.png"),
      d.signedGetUrl("thumbs/p/1.webp"),
      d.signedGetUrl("assets/p/1.png", { downloadName: "AI제작팀 컷 1.png" }),
    ]);
    const signs = calls.filter((c) => c.url.endsWith("/object/sign/zipup-ai"));
    expect(signs).toHaveLength(1);
    expect(signs[0].body).toEqual({ expiresIn: 3 * 3600, paths: ["assets/p/1.png", "thumbs/p/1.webp"] });
    expect(a).toBe("https://proj.supabase.co/storage/v1/object/sign/zipup-ai/assets/p/1.png?token=t-assets/p/1.png");
    expect(thumb).toContain("thumbs/p/1.webp?token=");
    expect(dl).toBe(`${a}&download=${encodeURIComponent("AI제작팀 컷 1.png")}`);

    // 같은 인스턴스에서는 한 시간 동안 같은 URL (추가 요청 없음)
    expect(await d.signedGetUrl("assets/p/1.png")).toBe(a);
    expect(calls.filter((c) => c.url.endsWith("/object/sign/zipup-ai"))).toHaveLength(1);
    // 유효 시간이 다르면 따로 서명
    await d.signedGetUrl("assets/p/1.png", { expiresIn: 24 * 3600 });
    expect(calls.filter((c) => c.url.endsWith("/object/sign/zipup-ai"))).toHaveLength(2);
  });

  it("returns an empty URL for a missing object instead of failing the whole batch", async () => {
    const { fetchImpl } = fakeSupabase();
    const d = createSupabaseDriver({ url: "https://proj.supabase.co", key: "sb_secret_x", bucket: "zipup-ai", fetch: fetchImpl });
    const [ok, missing] = await Promise.all([d.signedGetUrl("assets/p/ok.png"), d.signedGetUrl("assets/p/missing.png")]);
    expect(ok).toContain("token=");
    expect(missing).toBe("");
  });

  it("creates the private bucket once, then uploads with upsert", async () => {
    const { calls, fetchImpl } = fakeSupabase({ bucketExists: false });
    const d = createSupabaseDriver({ url: "https://proj.supabase.co", key: "eyJhbGciOi.jwt", bucket: "zipup-ai", fetch: fetchImpl });
    await d.put("assets/p/1.png", Buffer.from([1]), "image/png");
    await d.put("assets/p/2.png", Buffer.from([2]), "image/png");
    const creates = calls.filter((c) => c.method === "POST" && c.url.endsWith("/bucket"));
    expect(creates).toHaveLength(1);
    expect(creates[0].body).toEqual({ id: "zipup-ai", name: "zipup-ai", public: false });
    const upload = calls.find((c) => c.url.endsWith("/object/zipup-ai/assets/p/1.png"))!;
    expect(upload.method).toBe("POST");
    expect(upload.headers["x-upsert"]).toBe("true");
    expect(upload.headers["Content-Type"]).toBe("image/png");
    // JWT 형식(예전 service_role) 키는 Authorization에도 넣어요
    expect(upload.headers.Authorization).toBe("Bearer eyJhbGciOi.jwt");
  });

  it("sends new-format secret keys only in the apikey header", async () => {
    const { calls, fetchImpl } = fakeSupabase();
    const d = createSupabaseDriver({ url: "https://proj.supabase.co", key: "sb_secret_x", bucket: "zipup-ai", fetch: fetchImpl });
    await d.get("assets/p/1.png");
    const get = calls.find((c) => c.url.includes("/object/authenticated/"))!;
    expect(get.headers.apikey).toBe("sb_secret_x");
    expect(get.headers.Authorization).toBeUndefined();
  });

  it("gives the browser a signed upload URL and deletes by prefix", async () => {
    const { calls, fetchImpl } = fakeSupabase();
    const d = createSupabaseDriver({ url: "https://proj.supabase.co", key: "sb_secret_x", bucket: "zipup-ai", fetch: fetchImpl });
    const put = await d.signedPutUrl("uploads/u/2026-09/a.png", "image/png");
    expect(put.url).toBe("https://proj.supabase.co/storage/v1/object/upload/sign/zipup-ai/uploads/u/2026-09/a.png?token=up");
    expect(put.headers).toEqual({ "Content-Type": "image/png" });
    await d.delete("uploads/u/2026-09/a.png");
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.body).toEqual({ prefixes: ["uploads/u/2026-09/a.png"] });
    await tick();
  });
});
