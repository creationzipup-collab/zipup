import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`); });
page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
const step = (s) => console.log("→", s);

/** textarea 안에서 글자 위치(index)의 화면 좌표 — 복제 레이어의 단어 span으로 계산 */
async function wordPoint(word) {
  return page.evaluate((w) => {
    const spans = [...document.querySelectorAll("[data-wi]")];
    const el = spans.find((s) => s.textContent === w);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, word);
}

try {
  step("login");
  await page.goto(`${BASE}/login`);
  await page.fill("#email", "admin@creationzipup.com");
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });

  step("studio + prompt");
  await page.goto(`${BASE}/create/video`);
  await page.waitForLoadState("networkidle");
  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill("slow dolly zoom on a dancer in a red silk dress, rim light, shallow depth of field, heavy rain, 35mm film grain");
  await page.waitForTimeout(2500);

  step("hover 'dolly' → glossary card");
  let pt = await wordPoint("dolly");
  if (!pt) throw new Error("mirror span for 'dolly' not found");
  await page.mouse.move(pt.x - 30, pt.y);
  await page.mouse.move(pt.x, pt.y, { steps: 4 });
  await page.waitForTimeout(900);
  const card1 = await page.locator('[role="dialog"]').first().innerText().catch(() => "");
  console.log("card:", card1.replace(/\n+/g, " | ").slice(0, 160));
  await shot("90-hover-glossary");

  step("hover 'dancer' → server lookup");
  pt = await wordPoint("dancer");
  await page.mouse.move(pt.x, pt.y, { steps: 6 });
  await page.waitForTimeout(1400);
  const card2 = await page.locator('[role="dialog"]').first().innerText().catch(() => "");
  console.log("card2:", card2.replace(/\n+/g, " | ").slice(0, 160));

  step("double-click 'red' → replace with Korean");
  pt = await wordPoint("red");
  await page.mouse.dblclick(pt.x, pt.y);
  await page.waitForTimeout(700);
  await page.keyboard.type("진홍색");
  await page.waitForTimeout(1800);
  await shot("91-replace-candidates");
  const first = page.locator('[role="dialog"] ol li button').first();
  const label = await first.innerText();
  console.log("first candidate:", label.replace(/\n+/g, " | "));
  await first.click();
  await page.waitForTimeout(800);
  const value = await ta.inputValue();
  console.log("prompt now:", value);
  await shot("92-replaced");

  step("bilingual panel hover");
  await page.waitForTimeout(2500);
  const srcWord = page.locator("ol li button span span", { hasText: "rain" }).first();
  if (await srcWord.count()) {
    await srcWord.hover();
    await page.waitForTimeout(900);
    await shot("93-panel-hover");
  }

  step("admin translation section");
  await page.goto(`${BASE}/admin/settings`);
  await page.waitForLoadState("networkidle");
  await page.getByText("번역·사전 엔진").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot("94-admin-translation");
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error-lexicon");
} finally {
  console.log("errors:", errors.length ? errors.join("\n") : "none");
  await browser.close();
}
