// 캔버스 결과 리스트: 생성 노드를 이으면 결과가 쌓이고, OK한 결과가 다음 노드로 넘어가는지
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.text().includes("Maximum update depth")) errors.push("render loop"); });
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
const tiles = (id) => node(id).locator("button[aria-label$='크게 보기']");
const fit = async () => {
  await page.mouse.click(760, 960);
  await page.keyboard.press("Shift+Digit1");
  await page.waitForTimeout(700);
};

async function runAndWait(id, total, label = "실행") {
  await node(id).getByRole("button", { name: new RegExp(`^(${label})$`) }).click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const txt = (await node(id).innerText().catch(() => "")) ?? "";
    const m = txt.match(/지금까지 결과\s*(\d+)/);
    if (m && Number(m[1]) >= total && !/대기|생성 중|마무리/.test(txt)) return Number(m[1]);
  }
  throw new Error(`${id} did not finish`);
}

async function drag(fromSel, toSel) {
  const a = await page.locator(fromSel).boundingBox();
  const b = await page.locator(toSel).boundingBox();
  if (!a || !b) throw new Error(`handle not visible: ${!a ? fromSel : toSel}`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

  const proj = await api("/api/projects", { method: "POST", body: { name: `결과리스트 ${Date.now() % 10000}`, visibility: "team" } });
  const projectId = proj.item?.id ?? proj.project?.id ?? proj.id;
  const cv = await api("/api/canvases", { method: "POST", body: { name: "결과 리스트 테스트", projectId, template: "image-to-video" } });
  const canvasId = cv.item.id;
  ok(`canvas ${canvasId.slice(0, 8)}`);

  await page.goto(`${BASE}/canvas/${canvasId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  (await node("r1").innerText()).includes("아직 결과가 없어요") ? ok("template list waits for the video node's results") : fail("r1 empty state missing");

  // 이미지 생성 → 생성 노드의 "결과 리스트"로 새 리스트를 만들어 이어요
  await runAndWait("g1", 1);
  await node("g1").getByRole("button", { name: /결과 리스트/ }).click();
  await page.waitForTimeout(1000);
  const lists = await page.locator(".react-flow__node-results").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  const r2 = lists.find((x) => x !== "r1");
  r2 ? ok(`created a list for g1 (${r2})`) : fail(`no new list: ${lists}`);
  (await tiles(r2).count()) === 1 ? ok("new list shows g1's first result") : fail(`r2 tiles ${await tiles(r2).count()}`);

  // 한 번 더 돌리면 쌓여요
  await fit();
  await runAndWait("g1", 2);
  await page.waitForTimeout(1500);
  (await tiles(r2).count()) === 2 ? ok("second run stacks in the list") : fail(`r2 tiles after 2 runs: ${await tiles(r2).count()}`);

  // 예전 결과(아래쪽)를 OK
  const older = node(r2).locator("div.group").last();
  await older.hover();
  await older.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(400);
  (await node(r2).innerText()).includes("OK 1") ? ok("OK shows in the list footer") : fail("OK count missing");
  const okAsset = await older.getByRole("button", { name: /크게 보기$/ }).getAttribute("aria-label");

  // 리스트의 OK 출력 → 영상 생성의 시작 프레임
  await fit();
  await drag(`.react-flow__node[data-id="${r2}"] .react-flow__handle[data-handleid="ok"]`, `.react-flow__node[data-id="v1"] .react-flow__handle[data-handleid="start"]`);
  const edges = await page.locator(".react-flow__edge").count();
  ok(`connected list → video start (edges ${edges})`);
  await page.screenshot({ path: `${OUT}/canvas-list-connected.png` });

  const v = await runAndWait("v1", 1);
  await page.waitForTimeout(1500);
  const res = await api(`/api/canvases/${canvasId}/results?limit=50`);
  const lastVideo = res.items.find((g) => g.canvasNodeId === "v1");
  const startAsset = res.items.flatMap((g) => g.outputs).find((o) => o.id === lastVideo?.inputs?.startFrame);
  startAsset && okAsset?.startsWith(startAsset.filename) ? ok(`video used the OK'd image as its start frame (${startAsset.filename})`) : fail(`start frame ${lastVideo?.inputs?.startFrame} vs OK ${okAsset}`);
  (await tiles("r1").count()) === v ? ok("video result landed in the template list") : fail(`r1 tiles ${await tiles("r1").count()}`);

  // OK를 하나 더 → 영상 노드는 2번 돌아요
  const newer = node(r2).locator("div.group").first();
  await newer.hover();
  await newer.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(500);
  (await node("v1").getByRole("button", { name: "2번 실행" }).count()) === 1 ? ok("two OK images → video node runs twice") : fail("fan-out label missing");

  // OK만 보기
  await node(r2).getByRole("radio", { name: /^OK/ }).click();
  await page.waitForTimeout(300);
  (await tiles(r2).count()) === 2 ? ok("OK filter shows both OK results") : fail(`OK filter ${await tiles(r2).count()}`);

  // 캔버스에 꺼내기
  const inputs = ".react-flow__node-imageInput, .react-flow__node-videoInput";
  const before = await page.locator(inputs).count();
  const t = node("r1").locator("div.group").first();
  await t.hover();
  await t.getByRole("button", { name: /캔버스에 꺼내기/ }).click();
  await page.waitForTimeout(900);
  (await page.locator(inputs).count()) === before + 1 ? ok("placed a result as an input node") : fail("place failed");

  // 크게 보기 → 다음
  await fit();
  await tiles(r2).first().click();
  await page.waitForTimeout(900);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  await fit();
  await page.screenshot({ path: `${OUT}/canvas-list.png` });

  // 다시 열어도 그대로
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  (await tiles(r2).count()) === 2 && (await page.locator(".react-flow__node-results").count()) === 2 ? ok("lists survive a reload") : fail("lists lost after reload");
} catch (e) {
  fail(e.message);
  await page.screenshot({ path: `${OUT}/canvas-list-error.png` }).catch(() => {});
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
