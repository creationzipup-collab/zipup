import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR", isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
const go = async (path) => { await page.goto(`${BASE}${path}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(900); };
const overflow = async (label) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 391) console.log(`   ⚠ ${label}: horizontal overflow ${w}px`);
};
try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  for (const [path, name] of [["/", "60-m-home"], ["/create/image", "61-m-studio"], ["/library", "62-m-library"], ["/admin/users", "63-m-admin-users"], ["/admin", "64-m-admin"], ["/prompts", "65-m-prompts"]]) {
    await go(path);
    await overflow(path);
    await shot(name);
  }
} catch (e) {
  console.error("FAILED:", e.message);
} finally {
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no browser errors");
  await browser.close();
}
