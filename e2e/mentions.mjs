import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const FIX = process.env.FIX;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`); });
page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
const step = (s) => console.log("→", s);
try {
  step("login");
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

  step("seedance studio + 2 references");
  await page.goto(`${BASE}/create/video?model=seedance-2-5`);
  await page.waitForLoadState("networkidle");
  await page.locator('input[type=file]').first().setInputFiles([`${FIX}/hero_face.png`, `${FIX}/jacket_front.png`]);
  await page.waitForFunction(() => document.querySelectorAll("button[title='눌러서 프롬프트에 넣기']").length >= 2, null, { timeout: 60000 });
  const tags = await page.locator("button[title='눌러서 프롬프트에 넣기']").allInnerTexts();
  console.log("thumbnail tags:", tags);

  step("prompt with tangled mentions");
  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill("the girl from @img1 wearing the jacket from @jacket, background like [Image 3], @hero smiles at the camera, slow dolly in");
  await page.waitForTimeout(800);

  step("open @ tab");
  await page.getByRole("tab", { name: /언급/ }).click();
  await page.waitForTimeout(600);
  await shot("95-mentions-panel");
  const rows = await page.locator("ol li").allInnerTexts();
  console.log("rows:", rows.map((r) => r.replace(/\n+/g, " ")).slice(0, 5));

  step("link @hero → image 1");
  const heroRow = page.locator("ol li", { hasText: "@hero" }).first();
  await heroRow.locator("button[aria-haspopup='menu']").first().click();
  await page.getByRole("menuitem", { name: /이미지 1/ }).click();
  await page.waitForTimeout(400);

  step("normalize all");
  await page.getByRole("button", { name: /형식으로 정리/ }).click();
  await page.waitForTimeout(600);
  console.log("prompt now:", await ta.inputValue());
  await shot("96-mentions-normalized");

  step("hover a mention in the editor");
  const pt = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-wi]")].find((s) => s.textContent === "Image2");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (pt) {
    await page.mouse.move(pt.x, pt.y, { steps: 5 });
    await page.waitForTimeout(500);
    await shot("97-mention-hover");
  } else console.log("no Image2 token found");
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error-mentions");
} finally {
  console.log("errors:", errors.length ? errors.join("\n") : "none");
  await browser.close();
}
