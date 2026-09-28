import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await ctx.newPage();
const errors = [];
const watch = (p, tag) => {
  p.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text().slice(0, 300)}`); });
  p.on("response", (r) => { if (r.status() >= 500) errors.push(`${tag} HTTP ${r.status()} ${r.url()}`); });
};
watch(page, "main");
const shot = async (n, p = page) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
const step = (s) => console.log("→", s);
try {
  step("login");
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

  step("open studio");
  await page.goto(`${BASE}/create/image`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await shot("70-desk-empty");

  step("type english prompt → translation");
  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill("A woman in a red silk dress walking through a neon-lit Seoul alley at night, wet asphalt reflections, light rain, cinematic 35mm film grain");
  await page.waitForTimeout(3500);
  await shot("71-desk-translated");

  step("open suggestions on 1st segment");
  const seg = page.locator("ol li button").first();
  await seg.click();
  await page.waitForTimeout(600);
  const ko = page.locator("ol li input").first();
  await ko.fill("진홍색 실크 드레스를 입은 여자,");
  await page.getByRole("button", { name: /추천/ }).first().click();
  await page.waitForTimeout(1500);
  await shot("72-desk-suggest");
  step("apply suggestion #2");
  await page.locator("ol li motion\\.button, ol li button:has-text('적용')").nth(1).click().catch(async () => {
    await page.keyboard.press("2");
  });
  await page.waitForTimeout(1200);
  await shot("73-desk-applied");

  step("save v1 with Ctrl+S");
  await ta.click();
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(600);
  await shot("74-desk-save-dialog");
  await page.getByRole("dialog").getByRole("button", { name: /저장/ }).last().click();
  await page.waitForTimeout(1500);

  step("paste a new version → diff");
  const v2 = "A woman in a crimson silk dress running through a neon-lit Tokyo alley at night, wet asphalt reflections, heavy rain, backlit by pink signs, cinematic 50mm film grain";
  await page.evaluate((t) => navigator.clipboard.writeText(t), v2);
  await ta.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(1500);
  await shot("75-desk-paste-diff");

  step("save v2 and view versions");
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(500);
  await page.getByRole("dialog").locator("input").first().fill("도쿄·폭우·역광으로 변경");
  await page.getByRole("dialog").getByRole("button", { name: /저장/ }).last().click();
  await page.waitForTimeout(1500);
  await page.getByRole("tab", { name: /버전 기록/ }).click();
  await page.waitForTimeout(1000);
  await shot("76-desk-versions");

  step("generate (mock)");
  await page.getByRole("button", { name: /생성하기/ }).click();
  await page.waitForTimeout(9000);
  await shot("77-desk-generated");

  step("dual monitor");
  const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 15000 }), page.getByRole("button", { name: /듀얼 모니터/ }).click()]);
  watch(popup, "popup");
  await popup.setViewportSize({ width: 1600, height: 1000 });
  await popup.waitForLoadState("networkidle");
  await popup.waitForTimeout(3000);
  await page.waitForTimeout(2500);
  await shot("78-dual-main");
  await shot("79-dual-results", popup);
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error");
} finally {
  console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].slice(0, 30).join("\n") : "no browser errors");
  await browser.close();
}
