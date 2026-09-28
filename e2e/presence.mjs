import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--proxy-server=" + (process.env.HTTPS_PROXY ?? "")].filter((a) => !a.endsWith("=")) });
const errors = [];
async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email} pageerror: ${e.message}`));
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  return page;
}
try {
  const a = await login("jihoon@creationzipup.com");
  const created = await a.evaluate(async () => (await (await fetch("/api/canvases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "같이 보기 테스트", template: "image-to-video" }) })).json()));
  const id = created.item.id;
  await a.goto(`${BASE}/canvas/${id}`);
  const b = await login("admin@creationzipup.com");
  await b.goto(`${BASE}/canvas/${id}`);
  for (const p of [a, b]) await p.waitForLoadState("networkidle");
  await a.waitForTimeout(4000);
  const statusA = await a.locator("text=/명 접속|실시간|연결 중/").first().innerText().catch(() => "(none)");
  const statusB = await b.locator("text=/명 접속|실시간|연결 중/").first().innerText().catch(() => "(none)");
  console.log("presence A:", statusA, "| B:", statusB);

  // A moves the mouse and draws with the pen
  await a.mouse.move(700, 300);
  for (let i = 0; i < 10; i++) await a.mouse.move(700 + i * 10, 300 + i * 5);
  await a.keyboard.press("p");
  await a.mouse.move(600, 650);
  await a.mouse.down();
  for (let i = 0; i < 25; i++) await a.mouse.move(600 + i * 12, 650 + Math.sin(i / 3) * 35);
  await a.mouse.up();
  await a.keyboard.press("l");
  await a.mouse.move(600, 750);
  await a.mouse.down();
  for (let i = 0; i < 12; i++) await a.mouse.move(600 + i * 15, 750);
  await b.waitForTimeout(250);
  await b.screenshot({ path: `${OUT}/106-presence-b-sees-a.png` });
  await a.mouse.up();
  await b.waitForTimeout(1200);
  const cursorOnB = await b.locator(".react-flow__viewport-portal span", { hasText: "김" }).count().catch(() => 0);
  const pathsOnB = await b.locator(".react-flow__viewport-portal svg path").count();
  console.log("B sees remote cursor labels:", cursorOnB, "| B stroke paths:", pathsOnB);
  await a.screenshot({ path: `${OUT}/107-presence-a.png` });
} catch (e) {
  console.error("FAILED:", e.message);
} finally {
  console.log("errors:", errors.length ? errors.join("\n") : "none");
  await browser.close();
}
