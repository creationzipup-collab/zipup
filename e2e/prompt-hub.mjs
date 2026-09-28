// 프롬프트 라이브러리: 보내기 → 알림 → 받은 탭 → 대화 → 답장 알림
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/tmp/zipup-shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { console.log("✗", m); process.exitCode = 1; };
const ok = (m) => console.log("✓", m);

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email} pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`${email} HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  const api = async (path, init = {}) => {
    const r = await page.request.fetch(`${BASE}${path}`, { method: init.method ?? "GET", data: init.body, headers: { "content-type": "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok()) throw new Error(`${path} ${r.status()} ${JSON.stringify(j)}`);
    return j;
  };
  return { ctx, page, api };
}

const admin = await login("admin@creationzipup.com");
const member = await login("jihoon@creationzipup.com");
try {
  const dir = await admin.api("/api/directory?q=");
  const jihoon = dir.people.find((p) => p.email === "jihoon@creationzipup.com");
  if (!jihoon) throw new Error("jihoon not in directory");

  // 생성된 클립 하나 (프롬프트가 있는 것)
  const lib = await admin.api("/api/assets?limit=30");
  const clip = (lib.items ?? []).find((a) => a.prompt && a.source === "generated") ?? (lib.items ?? []).find((a) => a.prompt);
  if (!clip) throw new Error("no clip with prompt");

  const msg = `C101 톤 참고해 주세요 ${Date.now() % 10000}`;
  const sent = await admin.api("/api/prompts/share", { method: "POST", body: { assetId: clip.id, title: "허브 테스트 · 골든아워", message: msg, to: { users: [jihoon.id], team: true } } });
  sent.sent >= 1 ? ok(`sent to ${sent.sent} targets (preset ${sent.presetId.slice(0, 8)})`) : fail("nothing sent");

  // 받은 사람: 알림 + 받은 탭
  const n = await member.api("/api/notifications");
  const note = n.items.find((x) => x.type === "prompt_shared" && x.href?.includes(sent.presetId));
  note ? ok(`member notified: "${note.title}" → ${note.href}`) : fail("member has no prompt_shared notification");
  const inbox = await member.api("/api/prompts?tab=inbox");
  const got = inbox.items.find((i) => i.id === sent.presetId);
  got ? ok(`inbox has it (unseen=${inbox.unseen}, message="${got.share?.message}", clip=${!!got.clip})`) : fail("not in member inbox");
  // 같은 글을 예전에 보냈으면 처음 출처를 그대로 써요
  if (got?.origin?.projectId) ok(`origin recorded: ${got.origin.projectName} / ${got.origin.cutCode ?? "컷 없음"}`);
  else fail(`origin missing: ${JSON.stringify(got?.origin)}`);
  if (got && got.share?.seen) fail("should be unseen before opening");

  // 보낸 사람: 보낸 탭
  const sentTab = await admin.api("/api/prompts?tab=sent");
  sentTab.items.some((i) => i.id === sent.presetId) ? ok("admin sent tab has it") : fail("not in admin sent tab");

  // UI: 알림 링크로 열기 → 대화에 답장
  await member.page.goto(`${BASE}${note?.href ?? `/prompts?open=${sent.presetId}`}`);
  await member.page.waitForLoadState("networkidle");
  await member.page.waitForTimeout(1500);
  await member.page.screenshot({ path: `${OUT}/hub-member-inbox.png` });
  const box = member.page.locator("textarea[placeholder^='메시지']");
  await box.fill("좋아요! 이걸로 T03부터 다시 뽑아볼게요");
  await box.press("Enter");
  await member.page.waitForTimeout(1200);
  await member.page.screenshot({ path: `${OUT}/hub-member-replied.png` });

  const after = await member.api("/api/prompts?tab=inbox");
  const seen = after.items.find((i) => i.id === sent.presetId)?.share?.seen;
  seen ? ok("marked seen after opening") : fail("not marked seen");

  const thread = await admin.api(`/api/prompts/${sent.presetId}/messages`);
  thread.items.length >= 2 ? ok(`thread has ${thread.items.length} messages, ${thread.shares.length} share events`) : fail(`thread too short: ${thread.items.length}`);
  const an = await admin.api("/api/notifications");
  an.items.some((x) => x.type === "prompt_message" && x.href?.includes(sent.presetId)) ? ok("admin notified of reply") : fail("admin not notified of reply");

  // 받은 사람이 스튜디오에서 열 수 있는지 (비공개 프롬프트)
  await member.page.goto(`${BASE}/create/image?preset=${sent.presetId}`);
  await member.page.waitForLoadState("networkidle");
  const val = await member.page.locator("textarea").first().inputValue().catch(() => "");
  val.length > 5 ? ok("member can open the shared prompt in the studio") : fail("studio prefill empty for shared prompt");

  // 관리자 화면
  await admin.page.goto(`${BASE}/prompts?open=${sent.presetId}`);
  await admin.page.waitForLoadState("networkidle");
  await admin.page.waitForTimeout(1500);
  await admin.page.screenshot({ path: `${OUT}/hub-admin.png` });
  // 스튜디오 라이브러리 창
  await admin.page.goto(`${BASE}/create/image`);
  await admin.page.waitForLoadState("networkidle");
  await admin.page.getByRole("button", { name: /라이브러리/ }).first().click();
  await admin.page.waitForTimeout(1500);
  await admin.page.getByRole("tab", { name: /보낸/ }).click();
  await admin.page.waitForTimeout(1200);
  await admin.page.screenshot({ path: `${OUT}/hub-studio-dialog.png` });
} catch (e) {
  fail(e.message);
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
