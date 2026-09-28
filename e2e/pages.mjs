import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`console.${m.type()}: ` + m.text().slice(0, 300)); });
page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = async (n, full = false) => { await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); console.log("shot", n); };
const go = async (path) => { await page.goto(`${BASE}${path}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(1000); };
try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  await go("/settings");
  await shot("30-settings", true);
  await go("/prompts");
  await page.getByRole("button", { name: /글로 올리기/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByPlaceholder("예: 제품 누끼 · 스튜디오 조명").fill("제품 누끼 · 스튜디오 조명");
  await page.locator("textarea").first().fill("white seamless studio backdrop, softbox key light from left, product hero shot, crisp reflections, 85mm");
  await page.getByPlaceholder("광고, 제품, 시네마틱").fill("제품, 광고, 누끼");
  await shot("31-prompt-editor");
  await page.getByRole("button", { name: "올리기", exact: true }).click();
  await page.waitForTimeout(1200);
  await shot("32-prompts");
  // 스튜디오에서 사용
  await page.locator("a[href*='preset=']").first().click();
  await page.waitForURL(/\/create\/image\?preset=/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  await shot("33-studio-from-preset");
  await go("/library");
  await shot("34-library");
  await go("/projects");
  await shot("35-projects");
  await go("/canvas");
  await shot("36-canvas-list");
  await go("/");
  await shot("37-home");
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error");
} finally {
  console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].slice(0, 30).join("\n") : "no browser errors");
  await browser.close();
}
