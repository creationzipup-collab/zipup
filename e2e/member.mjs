import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text().slice(0, 300)); });
page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = async (n, full = false) => { await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); console.log("shot", n); };
const go = async (path) => { await page.goto(`${BASE}${path}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800); };
const step = (s) => console.log("→", s);
try {
  step("login as member");
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "jihoon@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  await page.waitForLoadState("networkidle");

  step("admin is blocked for members");
  await go("/admin");
  console.log("   /admin →", new URL(page.url()).pathname);

  step("image generation x2");
  await go("/create/image");
  await page.locator("textarea").first().fill("골든아워 해변을 걷는 강아지, 필름 사진 느낌");
  await page.getByRole("button", { name: "증가" }).click().catch(() => {});
  await page.getByRole("button", { name: /생성하기/ }).click();
  await page.waitForTimeout(1500);
  await shot("40-member-generating");
  await page.waitForTimeout(9000);
  await shot("41-member-generated");

  step("library: open lightbox, rate 5, pick, tag");
  await go("/library");
  await shot("42-member-library");
  const tile = page.locator("[data-asset-id]").first();
  if (await tile.count()) {
    await tile.click(); // 클릭 → 라이트박스
    await page.waitForTimeout(800);
    await page.keyboard.press("5");
    await page.keyboard.press("p");
    await page.waitForTimeout(800);
    await shot("44-member-lightbox");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.keyboard.down("Control");
    await tile.click(); // Ctrl+클릭 → 선택
    await page.keyboard.up("Control");
    await page.waitForTimeout(500);
    await shot("43-member-selected");
    await page.keyboard.press("Escape");
  } else {
    console.log("   (no [data-asset-id] tiles found)");
  }

  step("search syntax");
  await go(`/library?q=${encodeURIComponent("★5 is:pick @나")}`);
  await shot("45-member-search");

  step("create project");
  await go("/projects?new=1");
  await page.waitForTimeout(500);
  await shot("46-member-new-project");
  const nameInput = page.getByRole("dialog").locator("input").first();
  await nameInput.fill("뮤직비디오-A");
  await page.getByRole("dialog").getByRole("button", { name: /만들기|저장/ }).last().click();
  await page.waitForTimeout(2500);
  console.log("   after create →", new URL(page.url()).pathname);
  await shot("47-member-project");

  step("canvas from template + run all");
  await go("/canvas?new=1");
  await page.waitForTimeout(500);
  const dlg = page.getByRole("dialog");
  if (await dlg.count()) {
    await dlg.getByRole("button", { name: "만들기" }).click();
  } else {
    await page.getByRole("button", { name: /새 캔버스/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "만들기" }).click();
  }
  await page.waitForURL(/\/canvas\/[0-9a-f-]{36}/, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await shot("48-member-canvas");
  await page.getByRole("button", { name: /전체 실행/ }).click();
  await page.waitForTimeout(6000);
  await shot("49-member-canvas-running");
  // 이미지(3.5~6.5s) + 영상(9~15s) + 저장
  await page.waitForTimeout(30000);
  await shot("50-member-canvas-done");
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error");
} finally {
  console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].slice(0, 30).join("\n") : "no browser errors");
  await browser.close();
}
