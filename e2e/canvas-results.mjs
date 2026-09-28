// 캔버스 결과 모음: 여러 번 실행한 결과가 한곳에 모이고, 고르기·OK·꺼내기가 되는지
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
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
const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
const panel = () => page.locator("aside[aria-label='결과 모음']");

async function runAndWait(id, before) {
  await node(id).getByRole("button", { name: /^실행$/ }).click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const txt = (await node(id).innerText().catch(() => "")) ?? "";
    const m = txt.match(/지금까지 결과\s*(\d+)/);
    if (m && Number(m[1]) > before && !/대기|생성 중|마무리/.test(txt)) return Number(m[1]);
  }
  throw new Error(`${id} did not finish`);
}

try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

  const proj = await api("/api/projects", { method: "POST", body: { name: `결과모음 ${Date.now() % 10000}`, visibility: "team" } });
  const projectId = proj.item?.id ?? proj.project?.id ?? proj.id;
  const cv = await api("/api/canvases", { method: "POST", body: { name: "결과 모음 테스트", projectId, template: "image-to-video" } });
  const canvasId = cv.item.id;
  ok(`canvas ${canvasId.slice(0, 8)}`);

  await page.goto(`${BASE}/canvas/${canvasId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  // 한 종류에 하나뿐이면 번호 없이
  (await node("g1").innerText()).includes("이미지 생성") ? ok("gen node labelled") : fail("gen node label missing");

  const a = await runAndWait("g1", 0);
  const b = await runAndWait("g1", a);
  const c = await runAndWait("v1", 0);
  ok(`results per node: g1 ${a} → ${b}, v1 ${c}`);

  // 결과 모음 열기
  await page.getByRole("button", { name: /^결과/ }).click();
  await page.waitForTimeout(900);
  const count = await panel().locator("button[aria-label$='크게 보기']").count();
  count === b + c ? ok(`panel lists all ${count} results`) : fail(`panel shows ${count}, expected ${b + c}`);
  const runs = await panel().locator("ol > li").count();
  runs === 3 ? ok("3 runs on the timeline") : fail(`runs ${runs}`);
  await page.screenshot({ path: `${OUT}/canvas-results.png` });

  // 예전 실행 결과를 다음 노드로 (맨 아래 = g1 첫 실행)
  const oldRun = panel().locator("ol > li").last();
  const firstOld = oldRun.locator("div.group").first();
  await firstOld.hover();
  await firstOld.getByRole("button", { name: "이 결과를 다음 노드로 넘기기" }).click();
  await page.waitForTimeout(600);
  (await firstOld.innerText()).includes("다음 노드로") ? ok("old result is now passed to the next node") : fail("pick badge missing");
  const nodeData = await page.evaluate(async (id) => {
    const r = await fetch(`/api/canvases/${id}`);
    return r.json();
  }, canvasId);
  void nodeData;

  // OK 표시 → OK만
  await firstOld.hover();
  await firstOld.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(500);
  await panel().getByRole("button", { name: "OK만" }).click();
  await page.waitForTimeout(500);
  const okCount = await panel().locator("button[aria-label$='크게 보기']").count();
  okCount === 1 ? ok("OK filter shows the one marked result") : fail(`OK filter shows ${okCount}`);
  await panel().getByRole("button", { name: "OK만" }).click();

  // 이 노드 결과만
  await panel().getByRole("button", { name: "이 노드 결과만 보기" }).first().click();
  await page.waitForTimeout(400);
  const scoped = await panel().locator("button[aria-label$='크게 보기']").count();
  scoped === c || scoped === b ? ok(`node filter shows ${scoped}`) : fail(`node filter shows ${scoped}`);
  await panel().getByRole("button", { name: /결과만$/ }).click();

  // 캔버스에 꺼내기
  const inputs = ".react-flow__node-imageInput, .react-flow__node-videoInput";
  const before = await page.locator(inputs).count();
  const tile = panel().locator("div.group").first();
  await tile.hover();
  await tile.getByRole("button", { name: /캔버스에 꺼내기/ }).click();
  await page.waitForTimeout(900);
  const after = await page.locator(inputs).count();
  after === before + 1 ? ok("placed a result as an input node") : fail(`input nodes ${before} → ${after}`);

  // 크게 보기: 라이트박스에서 다음 결과로 넘어가는지
  await panel().locator("button[aria-label$='크게 보기']").first().click();
  await page.waitForTimeout(900);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/canvas-results-lightbox.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 목록 보기
  await panel().getByRole("radio", { name: "" }).last().click().catch(() => {});
  await page.locator("[title='목록으로 보기']").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/canvas-results-list.png` });

  // R로 닫기
  await page.mouse.click(700, 900);
  await page.keyboard.press("r");
  await page.waitForTimeout(600);
  (await panel().count()) === 0 ? ok("R closes the panel") : fail("panel still open after R");
  await page.screenshot({ path: `${OUT}/canvas-after.png` });
} catch (e) {
  fail(e.message);
  await page.screenshot({ path: `${OUT}/canvas-results-error.png` }).catch(() => {});
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
