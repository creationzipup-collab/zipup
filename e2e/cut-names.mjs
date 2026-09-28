// 컷 이름: 자유롭게 짓고, 목록·상세·스튜디오에서 바로 바꾸고, 바꾸면 파일 이름도 따라가는지
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
const names = async () => (await page.locator("li[class*='group'] button span[title]").allInnerTexts()).map((s) => s.trim());
const row = (name) => page.locator("li").filter({ has: page.locator(`span[title="${name}"]`) }).first();

try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

  const proj = await api("/api/projects", { method: "POST", body: { name: `컷이름 ${Date.now() % 10000}`, visibility: "team" } });
  const projectId = proj.item?.id ?? proj.project?.id ?? proj.id;
  await page.goto(`${BASE}/projects/${projectId}?tab=cuts`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);

  // 1) 이름부터 적어서 만들기 (추천 이름이 선택돼 있어 바로 덮어써요)
  await page.getByRole("button", { name: "첫 컷 만들기" }).click();
  const nameBox = page.getByLabel("이름", { exact: true });
  (await nameBox.inputValue()) === "C001" ? ok("suggested C001 in the name box") : fail(`suggestion ${await nameBox.inputValue()}`);
  await page.keyboard.type("오프닝 시퀀스");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  (await names()).includes("오프닝 시퀀스") ? ok("created a cut named '오프닝 시퀀스' (spaces and Korean kept)") : fail(`names ${await names()}`);

  // 2) 여러 개 한 번에
  await page.getByRole("button", { name: "컷 추가" }).click();
  await page.getByLabel("이름", { exact: true }).fill("SEQ_08");
  await page.getByRole("button", { name: "여러 개 한 번에" }).click();
  await page.getByRole("spinbutton").fill("3");
  await page.getByRole("button", { name: "3개 만들기" }).click();
  await page.waitForTimeout(900);
  const after = await names();
  ["SEQ_08", "SEQ_09", "SEQ_10"].every((n) => after.includes(n)) ? ok("bulk created SEQ_08 … SEQ_10") : fail(`bulk ${after}`);

  // 3) 목록에서 이름 바꾸기 (연필)
  await row("SEQ_09").hover();
  await row("SEQ_09").getByRole("button", { name: "이름 바꾸기" }).click();
  const edit = page.getByLabel("컷 이름", { exact: true });
  await edit.fill("엔딩 롱테이크");
  await edit.press("Enter");
  await edit.waitFor({ state: "detached", timeout: 20000 });
  await page.waitForTimeout(600);
  (await names()).includes("엔딩 롱테이크") && !(await names()).includes("SEQ_09") ? ok("renamed SEQ_09 → 엔딩 롱테이크 inline") : fail(`rename ${await names()}`);

  // 4) 같은 이름은 막아요 (대소문자 달라도)
  await row("SEQ_10").hover();
  await row("SEQ_10").getByRole("button", { name: "이름 바꾸기" }).click();
  await page.getByLabel("컷 이름", { exact: true }).fill("seq_08");
  await page.getByLabel("컷 이름", { exact: true }).press("Enter");
  await page.waitForTimeout(700);
  await page.waitForTimeout(800);
  const dupToast = await page.locator("[data-sonner-toast]", { hasText: "이미 있어요" }).count();
  dupToast > 0 && (await page.getByLabel("컷 이름", { exact: true }).count()) === 1 ? ok("duplicate name blocked, editor stays open") : fail(`dup toast ${dupToast}`);
  await page.getByLabel("컷 이름", { exact: true }).press("Escape");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/cut-names-list.png` });

  // 5) 이름을 바꾸면 그 컷 파일 이름도 바뀌어요
  const board = await api(`/api/projects/${projectId}/cuts`);
  const ending = board.cuts.find((c) => c.code === "엔딩 롱테이크");
  await api("/api/generations", { method: "POST", body: { modelId: "seedream-5-pro", prompt: "rooftop at dusk, wide", params: {}, count: 1, projectId, cutId: ending.id } });
  let file = null;
  for (let i = 0; i < 30 && !file; i++) {
    await page.waitForTimeout(1000);
    const g = await api("/api/generations?limit=5");
    file = g.items.find((x) => x.cutId === ending.id && x.outputs.length)?.outputs[0]?.filename ?? null;
  }
  file?.includes("엔딩-롱테이크") ? ok(`file carries the cut name: ${file}`) : fail(`file name ${file}`);
  await api(`/api/cuts/${ending.id}`, { method: "PATCH", body: { code: "엔딩 최종" } });
  const g2 = await api("/api/generations?limit=5");
  const renamed = g2.items.find((x) => x.cutId === ending.id)?.outputs[0]?.filename;
  renamed?.includes("엔딩-최종") ? ok(`file renamed with the cut: ${renamed}`) : fail(`after rename ${renamed}`);

  // 6) 스튜디오: 연필로 이름 바꾸기, +로 이름 적어 새 컷
  await page.goto(`${BASE}/create/image?project=${projectId}&cut=${ending.id}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "컷 이름 바꾸기" }).click();
  await page.getByLabel("컷 이름", { exact: true }).fill("엔딩 B");
  await page.getByLabel("컷 이름", { exact: true }).press("Enter");
  await page.getByLabel("컷 이름", { exact: true }).waitFor({ state: "detached", timeout: 20000 });
  await page.waitForTimeout(800);
  (await page.locator("body").innerText()).includes("엔딩 B") ? ok("renamed the cut from the studio bar") : fail("studio rename not shown");
  await page.getByRole("button", { name: "새 컷" }).click();
  await page.keyboard.type("인서트 A");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  const bar = await page.locator("text=작업 위치").locator("..").innerText();
  bar.includes("인서트 A") ? ok("created '인서트 A' from the studio and selected it") : fail(`studio bar: ${bar}`);
  await page.screenshot({ path: `${OUT}/cut-names-studio.png` });

  // 7) 상세 화면에서 이름 바꾸기
  const board2 = await api(`/api/projects/${projectId}/cuts`);
  const insert = board2.cuts.find((c) => c.code === "인서트 A");
  await page.goto(`${BASE}/projects/${projectId}?tab=cuts&cut=${insert.id}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "이름 바꾸기" }).first().click();
  await page.getByLabel("컷 이름", { exact: true }).fill("인서트 A · 손 클로즈업");
  await page.getByLabel("컷 이름", { exact: true }).press("Enter");
  await page.getByLabel("컷 이름", { exact: true }).waitFor({ state: "detached", timeout: 20000 });
  await page.waitForTimeout(800);
  (await page.locator("body").innerText()).includes("인서트 A · 손 클로즈업") ? ok("renamed from the cut detail header") : fail("detail rename missing");
  await page.screenshot({ path: `${OUT}/cut-names-detail.png` });
} catch (e) {
  fail(e.message);
  await page.screenshot({ path: `${OUT}/cut-names-error.png` }).catch(() => {});
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
