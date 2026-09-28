import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await shot("10-home");
  await page.goto(`${BASE}/create/image`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await shot("11-studio-image");
  await page.fill("textarea", "비 오는 밤 네온 거리의 인물 클로즈업, 시네마틱 35mm");
  await page.getByRole("button", { name: /생성하기/ }).click();
  await page.waitForTimeout(2500);
  await shot("12-studio-generating");
  await page.waitForTimeout(9000);
  await shot("13-studio-done");
  await page.goto(`${BASE}/create/video`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await shot("14-studio-video");
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error");
} finally {
  console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 20).join("\n") : "no browser errors");
  await browser.close();
}
