// 로컬 개발 서버 대상 시나리오 점검 + 스크린샷 (pnpm dev 실행 중이어야 함)
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/zipup-shots";
const step = process.argv[2] ?? "all";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("shot", name);
}

try {
  if (step === "all" || step === "signup") {
    await page.goto(`${BASE}/signup`);
    await page.waitForLoadState("networkidle");
    await shot("01-signup");
    await page.fill("#name", "김관리");
    await page.fill("#title", "대표");
    await page.fill("#email", "admin@creationzipup.com");
    await page.fill("#pw", "password1234");
    await page.getByRole("button", { name: /AI제작팀/ }).click();
    await page.getByRole("button", { name: /가입 신청하기/ }).click();
    await page.waitForURL(/\/($|pending)/, { timeout: 30000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await shot("02-home-admin");
    console.log("url after signup:", page.url());
  }
  if (step === "login") {
    await page.goto(`${BASE}/login`);
    await page.fill("#email", process.env.EMAIL ?? "admin@creationzipup.com");
    await page.fill("#password", process.env.PASSWORD ?? "password1234");
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
    await page.waitForLoadState("networkidle");
    await shot("login-result");
  }
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error");
} finally {
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no browser errors");
  await browser.close();
}
