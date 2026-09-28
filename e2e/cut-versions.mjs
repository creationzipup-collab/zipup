// 컷 버전: 생성할 때 자동 버전, ⌘S 메모, 버전별 테이크
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 960 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const fail = (m) => { console.log("✗", m); process.exitCode = 1; };
const ok = (m) => console.log("✓", m);
const api = async (path, init = {}) => {
  const r = await page.request.fetch(`${BASE}${path}`, { method: init.method ?? "GET", data: init.body, headers: { "content-type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok()) throw new Error(`${path} ${r.status()} ${JSON.stringify(j)}`);
  return j;
};
try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

  // 새 프로젝트 + 컷
  const proj = await api("/api/projects", { method: "POST", body: { name: `버전테스트 ${Date.now() % 10000}`, visibility: "team" } });
  const projectId = proj.item?.id ?? proj.project?.id ?? proj.id;
  const cuts = await api(`/api/projects/${projectId}/cuts`, { method: "POST", body: { count: 1 } });
  const cutId = cuts.items[0].id;
  ok(`project ${projectId.slice(0, 8)} cut ${cuts.items[0].code}`);

  const g = (prompt) => api("/api/generations", { method: "POST", body: { modelId: "seedream-5-pro", prompt, params: {}, count: 1, projectId, cutId, recordVersion: true } });

  await g("a lighthouse at dusk, cinematic, 35mm");
  await g("a lighthouse at dusk, cinematic, 35mm");
  let view = await api(`/api/cut-docs?projectId=${projectId}&cutId=${cutId}&kind=image`);
  view.versions.length === 1 ? ok("same prompt twice → still v1") : fail(`expected 1 version, got ${view.versions.length}`);
  await g("a lighthouse at dusk, heavy fog, cinematic, 35mm");
  view = await api(`/api/cut-docs?projectId=${projectId}&cutId=${cutId}&kind=image`);
  view.versions.length === 2 ? ok("changed prompt → v2") : fail(`expected 2 versions, got ${view.versions.length}`);

  const s1 = await api("/api/cut-docs", { method: "POST", body: { projectId, cutId, kind: "image", prompt: "a lighthouse at dusk, heavy fog, cinematic, 35mm", note: "안개 추가" } });
  !s1.created && s1.version === 2 ? ok("⌘S same text → note on v2") : fail(`unexpected save ${JSON.stringify(s1)}`);
  const s2 = await api("/api/cut-docs", { method: "POST", body: { projectId, cutId, kind: "image", prompt: "a lighthouse at dusk, heavy fog, red beam, cinematic", note: "빨간 빔" } });
  s2.created && s2.version === 3 ? ok("⌘S new text → v3") : fail(`unexpected save ${JSON.stringify(s2)}`);

  // 목업 생성이 끝날 때까지
  for (let i = 0; i < 30; i++) {
    const a = await api("/api/generations/active");
    if (!(a.items ?? []).some((x) => ["pending", "queued", "in_progress", "finalizing"].includes(x.status))) break;
    await page.waitForTimeout(1000);
  }
  view = await api(`/api/cut-docs?projectId=${projectId}&cutId=${cutId}&kind=image`);
  const v1 = view.versions.find((v) => v.version === 1);
  const v2 = view.versions.find((v) => v.version === 2);
  v1?.takeCount === 2 && v2?.takeCount === 1 ? ok(`takes per version: v1=${v1.takeCount}, v2=${v2.takeCount}`) : fail(`takes v1=${v1?.takeCount} v2=${v2?.takeCount}`);
  v2?.note === "안개 추가" ? ok("v2 note kept") : fail(`v2 note ${v2?.note}`);

  // 라이브러리에는 안 보여요
  const saved = await api("/api/prompts?tab=saved");
  saved.items.some((i) => i.id === view.doc.id) ? fail("cut doc leaked into the library") : ok("cut doc not in the library");

  // 스튜디오 화면: 이 컷 고른 상태로 버전 탭
  await page.goto(`${BASE}/create/image?cut=${cutId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: /버전 기록/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/cut-versions.png` });

  // 보내기 (컷 기록 → 라이브러리 사본으로)
  const dir = await api("/api/directory?q=");
  const jihoon = dir.people.find((p) => p.email === "jihoon@creationzipup.com");
  const sent = await api("/api/prompts/share", { method: "POST", body: { presetId: view.doc.id, title: "등대 · 안개 빨간 빔", message: "C001 이 버전 봐 주세요", to: { users: [jihoon.id] } } });
  sent.presetId !== view.doc.id ? ok("sending a cut version sends a library copy") : fail("sent the cut doc itself");
} catch (e) {
  fail(e.message);
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
