import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = async (n, full = false) => { await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); console.log("shot", n); };
const go = async (path) => { await page.goto(`${BASE}${path}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(1200); };
try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  await go("/");
  await shot("80-home-dark");
  // 히어로 프롬프트 → 스튜디오
  await page.getByRole("textbox", { name: "프롬프트" }).fill("비 오는 밤 네온 거리의 인물 클로즈업, 시네마틱 35mm");
  await page.getByRole("button", { name: /이미지 만들기/ }).click();
  await page.waitForURL(/\/create\/image\?prompt=/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await shot("81-studio-from-hero-ko");
  // 프롬프트 공유 페이지
  await go("/prompts");
  await shot("82-prompts");
  const link = page.locator("a[href^='/prompts/']").first();
  if (await link.count()) {
    await link.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);
    await shot("83-prompt-doc");
  }
  // 라이트 모드
  await ctx.addCookies([{ name: "zipup-theme", value: "light", url: BASE }]);
  await go("/");
  await shot("84-home-light");
  await go("/create/image");
  await page.locator("textarea").first().fill("A woman in a red silk dress walking through a neon-lit Seoul alley at night, cinematic 35mm");
  await page.waitForTimeout(3000);
  await shot("85-studio-light");
  await ctx.addCookies([{ name: "zipup-theme", value: "dark", url: BASE }]);
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error");
} finally {
  console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].slice(0, 20).join("\n") : "no browser errors");
  await browser.close();
}
