/**
 * 카나리 시험(실제 API 전용, E2E_REAL_API=1): 패키지 A가 시드한 가짜 카드(tests/fixtures/canary — 회사 "CANARY-회사", 티커 "CNRY",
 * 시작일 "2099-01-02", 수익률 42.42)의 결과급 값이 공개 전에는 어디에도 없어야 한다.
 * 확인 범위: 페이지 HTML(RSC 페이로드 포함)·이후 모든 fetch/XHR 응답(오늘·카드·개념·일지·질문자·오류 응답)·DOM·
 * 되돌리기 창 중 떠나 보낸 판단의 '결과 대기' 일지 행. 마지막에 공개해 카나리가 실제로 그 카드였는지 확인한다(양성 대조).
 *
 * 실행: 시험 DB에 카나리 카드를 시드하고(deckOrder 1) 새 초대 코드로
 *   E2E_REAL_API=1 E2E_INVITE_CODE=<새 코드> npm run e2e:real
 * (이미 떠 있는 서버를 쓰려면 E2E_BASE_URL. 그 서버의 PUBLIC_ORIGIN이 그 주소여야 한다.)
 */
import { expect, test, type Page } from "@playwright/test";

const REAL = process.env.E2E_REAL_API === "1";
const CANARY = ["CANARY-회사", "CNRY", "2099-01-02", "42.42"];
const CANARY_CASE = process.env.E2E_CANARY_CASE_ID ?? "8be0bf0e-3014-4d6a-9021-f3b3dad37688";

test.skip(!REAL, "실제 API에서만 돈다(E2E_REAL_API=1)");

type Captured = { url: string; status: number; body: string };

async function domHasCanary(page: Page): Promise<string[]> {
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  return CANARY.filter((c) => html.includes(c));
}

test("공개 전: HTML·RSC·XHR·DOM·결과 대기 행에 카나리 값이 없다", async ({ page }) => {
  const captured: Captured[] = [];
  let revealing = false;   // 양성 대조(공개) 뒤 응답은 세지 않는다
  page.on("response", async (res) => {
    const type = res.request().resourceType();
    if (revealing || !["document", "fetch", "xhr"].includes(type)) return;
    try {
      captured.push({ url: res.url(), status: res.status(), body: await res.text() });
    } catch { /* 리디렉션 등 본문 없는 응답 */ }
  });
  await page.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.documentElement.appendChild(s));
  });

  await page.goto("/");
  // 입장: 초대 코드 → (처음이면) 안내 3장
  await page.waitForSelector("#inv-code, #onb-next, #stage .sc, .done-title", { timeout: 30_000 });
  if (await page.locator("#inv-code").count()) {
    const code = process.env.E2E_INVITE_CODE;
    if (!code) throw new Error("세션이 없어요: 새 초대 코드를 E2E_INVITE_CODE로 주세요(npm run invite -- create --count 1)");
    await page.fill("#inv-code", code);
    await page.fill("#inv-nick", process.env.E2E_NICKNAME ?? "카나리");
    await page.click(".invite-form button[type=submit]");
    await page.waitForSelector("#onb-next, #stage .sc, .done-title", { timeout: 15_000 });
  }
  for (let i = 0; i < 3 && (await page.locator("#onb-next").count()); i++) await page.click("#onb-next");
  await page.waitForSelector("#stage .sc", { timeout: 15_000 });
  expect(await domHasCanary(page)).toEqual([]);

  // 오늘 세트에 카나리 카드가 있어야 시험이 의미가 있다
  const today = await page.evaluate(async () => (await (await fetch("/api/session/today", { cache: "no-store" })).json()) as { cards: { caseId: string }[] });
  expect(today.cards.map((c) => c.caseId), "카나리 카드가 오늘 세트에 있다(deckOrder 1로 시드, 새 사용자)").toContain(CANARY_CASE);
  await expect(page.locator("#stage .sc:last-child .meta")).toContainText("시험 업종");   // 덱 첫 장 = 카나리

  // 세 판을 모두 열어 본다
  for (const t of ["흐름", "그때", "숫자"]) await page.locator("#stage .sc:last-child .panel-tabs button", { hasText: t }).click();
  expect(await domHasCanary(page)).toEqual([]);

  // 오늘 세트의 모든 카드·질문자 응답·오류 응답
  await page.evaluate(async (canaryId) => {
    const j = (r: Response) => r.json() as Promise<{ evidenceOptions?: { id: string }[] }>;
    const t = (await (await fetch("/api/session/today", { cache: "no-store" })).json()) as { cards: { caseId: string; version: number }[] };
    for (const c of t.cards) {
      const pc = await j(await fetch(`/api/cases/${c.caseId}`, { cache: "no-store" }));
      const evidenceId = pc.evidenceOptions?.[0]?.id ?? "ev1";
      await fetch("/api/ai/question", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: c.caseId, evidenceId, confidence: 3 }) });
    }
    await fetch("/api/cases/00000000-0000-4000-8000-000000000000", { cache: "no-store" });
    await fetch("/api/judgments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: canaryId, caseVersion: 1 }) });
    await fetch("/api/ai/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ judgmentId: "00000000-0000-4000-8000-000000000000" }) });
  }, CANARY_CASE);

  // 일지·개념 탭(판단 전)
  await page.click('#nav button[data-v="journal"]');
  await page.waitForSelector("#cal");
  await page.click('#nav button[data-v="concepts"]');
  await page.waitForSelector(".clist");
  await page.click('#nav button[data-v="today"]');
  await page.waitForSelector("#stage .sc");

  // 카나리 카드를 판단하고 되돌리기 창 안에 일지로 → 공개 없이 보내져 '결과 대기' 행
  await page.locator("#ev .ds-chip").first().click();
  await page.locator("#conf button").nth(2).click();
  await page.click("#btnR");
  await page.mouse.move(2, 2);
  await page.locator("#toast #undo").waitFor();
  await page.click('#nav button[data-v="journal"]');
  await expect(page.locator(".jstate--wait")).toHaveCount(1);
  await expect(page.locator(".jrow-title")).toHaveText("시험 업종 · 중형");
  expect(await domHasCanary(page), "결과 대기 행 DOM").toEqual([]);

  const leaks = captured.flatMap((c) => CANARY.filter((v) => c.body.includes(v)).map((v) => `${c.status} ${c.url} ← "${v}"`));
  expect(captured.length, "응답을 실제로 모았다").toBeGreaterThan(8);
  expect(captured.some((c) => c.url.includes("/api/journal")), "일지 응답 포함").toBe(true);
  expect(captured.some((c) => c.url.includes(`/api/cases/${CANARY_CASE}`)), "카나리 카드 응답 포함").toBe(true);
  expect(leaks, "공개 전 응답에 카나리 값 없음").toEqual([]);

  // 양성 대조: 오늘 탭으로 돌아가면 공개되고, 그때 처음으로 카나리 회사가 보인다
  revealing = true;
  await page.click('#nav button[data-v="today"]');
  await expect(page.locator(".reveal .name")).toHaveText("CANARY-회사 (CNRY)", { timeout: 15_000 });
});
