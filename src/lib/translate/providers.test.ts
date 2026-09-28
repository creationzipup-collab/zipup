import { describe, expect, it } from "vitest";

import { azureDictionary, MtError, mtTranslate } from "./providers";

type Call = { url: string; init: RequestInit };

function fake(handler: (url: string, body: unknown) => { status?: number; json?: unknown; text?: string }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const r = handler(url, typeof init.body === "string" ? JSON.parse(init.body) : init.body);
    return new Response(r.text ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("machine translation providers", () => {
  it("sends every segment to Azure in one request and keeps the order", async () => {
    const { calls, fetchImpl } = fake((_url, body) => ({ json: (body as { Text: string }[]).map((b) => ({ translations: [{ text: `ko:${b.Text}` }] })) }));
    const out = await mtTranslate("azure", { azure: { key: "k", region: "koreacentral" } }, ["a red dress", "at night"], "en", "ko", fetchImpl);
    expect(out).toEqual(["ko:a red dress", "ko:at night"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("to=ko");
    expect(calls[0].url).toContain("from=en");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Region"]).toBe("koreacentral");
  });

  it("maps Chinese to the right codes per provider", async () => {
    const { calls, fetchImpl } = fake(() => ({ json: [{ translations: [{ text: "x" }] }] }));
    await mtTranslate("azure", { azure: { key: "k" } }, ["夜晚"], "zh", "ko", fetchImpl);
    expect(calls[0].url).toContain("from=zh-Hans");
  });

  it("joins lines for Papago and splits the answer back", async () => {
    const { calls, fetchImpl } = fake((_url, body) => ({
      json: { message: { result: { translatedText: (body as { text: string }).text.split("\n").map((l) => `ko:${l}`).join("\n") } } },
    }));
    const out = await mtTranslate("papago", { papago: { id: "id-1234567", key: "key-1234567" } }, ["one, two", "three"], "en", "ko", fetchImpl);
    expect(out).toEqual(["ko:one, two", "ko:three"]);
    expect(calls).toHaveLength(1);
  });

  it("uses the free DeepL host for :fx keys", async () => {
    const { calls, fetchImpl } = fake(() => ({ json: { translations: [{ text: "안녕" }] } }));
    await mtTranslate("deepl", { deepl: { key: "abc:fx" } }, ["hi"], "en", "ko", fetchImpl);
    expect(calls[0].url.startsWith("https://api-free.deepl.com")).toBe(true);
  });

  it("explains bad keys and exhausted quotas in Korean", async () => {
    const auth = fake(() => ({ status: 401, text: "Access denied" }));
    await expect(mtTranslate("google", { google: { key: "bad-key-123" } }, ["x"], "en", "ko", auth.fetchImpl)).rejects.toMatchObject({ code: "auth" });
    const quota = fake(() => ({ status: 403, text: '{"error":{"code":403001,"message":"Out of call volume quota"}}' }));
    const err = await mtTranslate("azure", { azure: { key: "k" } }, ["x"], "en", "ko", quota.fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(MtError);
    expect((err as MtError).code).toBe("quota");
  });

  it("reads Azure dictionary senses with back-translations", async () => {
    const { fetchImpl } = fake(() => ({
      json: [
        {
          translations: [
            { displayTarget: "진홍색", posTag: "NOUN", confidence: 0.6, backTranslations: [{ displayText: "crimson" }, { displayText: "scarlet" }] },
            { displayTarget: "진홍색의", posTag: "ADJ", confidence: 0.4, backTranslations: [] },
          ],
        },
      ],
    }));
    const [senses] = await azureDictionary({ azure: { key: "k" } }, ["crimson"], "en", "ko", fetchImpl);
    expect(senses[0]).toMatchObject({ pos: "NOUN", text: "진홍색", back: ["crimson", "scarlet"] });
    expect(senses).toHaveLength(2);
  });
});
