import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
const shot = async (n, full = false) => { await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); console.log("shot", n); };
const go = async (path) => { await page.goto(`${BASE}${path}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(1200); };
try {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  await go("/admin");
  await shot("20-admin-home", true);
  await go("/admin/users?status=pending");
  await shot("21-admin-users-pending");
  // 한 명 승인
  const approveBtn = page.getByRole("button", { name: /^승인$/ }).first();
  if (await approveBtn.count()) await approveBtn.click();
  await page.waitForTimeout(1500);
  await shot("22-admin-users-after-approve");
  await page.getByRole("radio", { name: /활성/ }).click();
  await page.waitForTimeout(1200);
  await shot("23-admin-users-active");
  await go("/admin/teams");
  await shot("24-admin-teams", true);
  await page.locator("button[aria-label='편집']").first().click();
  await page.waitForTimeout(500);
  await shot("25-admin-team-dialog");
  await page.keyboard.press("Escape");
  await go("/admin/models");
  await page.getByRole("button", { name: /단가·공지/ }).first().click();
  await page.waitForTimeout(400);
  await shot("26-admin-models", true);
  await go("/admin/settings");
  await page.fill("input[aria-label='파일명 템플릿']", "{team}_{project}_{prompt}_{seq}");
  await page.waitForTimeout(500);
  await shot("27-admin-settings", true);
  await go("/admin/audit");
  await shot("28-admin-audit", true);
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error");
} finally {
  console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 20).join("\n") : "no browser errors");
  await browser.close();
}
