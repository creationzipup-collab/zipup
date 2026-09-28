import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "ko-KR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("realtime")) errors.push(`console: ${m.text().slice(0, 300)}`); });
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

  step("create canvas via API");
  const created = await page.evaluate(async () => (await (await fetch("/api/canvases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "캔버스 테스트", template: "blank" }) })).json()));
  const canvasId = created.canvas?.id ?? created.id ?? created.item?.id;
  console.log("canvas:", canvasId);
  await page.goto(`${BASE}/canvas/${canvasId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);

  step("double-click pane → quick add → prompt");
  await page.mouse.dblclick(520, 420);
  await page.waitForTimeout(400);
  await shot("100-quickadd-empty");
  await page.keyboard.type("프롬프트");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  await page.locator(".react-flow__node-prompt textarea").fill("a dancer in a red dress on a neon stage, cinematic");

  step("drag from prompt output to empty space → suggestions");
  const handle = page.locator(".react-flow__node-prompt .react-flow__handle-right").first();
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 200, hb.y + 30, { steps: 12 });
  await page.mouse.move(hb.x + 260, hb.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await shot("101-quickadd-suggest");
  const sugg = await page.locator('[role="dialog"][aria-label="노드 추가"] button').allInnerTexts();
  console.log("suggestions:", sugg.slice(0, 4).map((s) => s.replace(/\n+/g, " | ")));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  const edgesCount = await page.locator(".react-flow__edge").count();
  console.log("edges after pick:", edgesCount, "nodes:", await page.locator(".react-flow__node").count());

  step("add list node by typing / and connect it to the gen node prompt");
  await page.mouse.move(420, 700);
  await page.keyboard.press("/");
  await page.waitForTimeout(300);
  await page.keyboard.type("리스트");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const inputs = page.locator(".react-flow__node-list input");
  await inputs.nth(0).fill("close-up");
  await inputs.nth(1).fill("wide shot");
  await inputs.nth(1).press("Enter");
  await page.locator(".react-flow__node-list input").nth(2).fill("low angle");
  const lh = await page.locator(".react-flow__node-list .react-flow__handle-right").first().boundingBox();
  const target = await page.locator(".react-flow__node-imageGen .react-flow__handle-left").first().boundingBox();
  await page.mouse.move(lh.x + lh.width / 2, lh.y + lh.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const badge = await page.locator(".react-flow__node-imageGen").innerText();
  console.log("gen node shows ×3:", /×3/.test(badge), "/", /3번 실행/.test(badge));
  await shot("102-list-fanout");

  step("pen sketch + undo");
  await page.keyboard.press("p");
  await page.mouse.move(900, 300);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(900 + i * 12, 300 + Math.sin(i / 3) * 40);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const paths1 = await page.locator(".react-flow__viewport-portal svg path").count();
  console.log("sketch paths:", paths1);
  await page.keyboard.press("l");
  await page.mouse.move(900, 500);
  await page.mouse.down();
  for (let i = 0; i < 15; i++) await page.mouse.move(900 + i * 14, 500 + Math.cos(i / 3) * 30);
  await shot("103-sketch-laser");
  await page.mouse.up();
  await page.keyboard.press("v");
  await page.waitForTimeout(900);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await page.waitForTimeout(600);
  console.log("paths after undo:", await page.locator(".react-flow__viewport-portal svg path").count());

  step("run the fan-out node (mock)");
  await page.locator(".react-flow__node-imageGen button", { hasText: "3번 실행" }).click();
  await page.waitForTimeout(6000);
  await shot("104-fanout-ran");
  console.log("gen node text:", (await page.locator(".react-flow__node-imageGen").innerText()).replace(/\n+/g, " | ").slice(0, 200));

  step("outline + shortcuts");
  await page.getByRole("button", { name: "노드 목록" }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press("?");
  await page.waitForTimeout(300);
  await shot("105-outline-help");
} catch (e) {
  console.error("FAILED:", e.message);
  await shot("error-canvas2");
} finally {
  console.log("errors:", errors.length ? errors.join("\n") : "none");
  await browser.close();
}
