/**
 * 프로토타입 스모크 B·C·D를 옮긴 것: 되돌리기 창 중 이탈(결과 대기 → 돌아오면 공개), 한 장 더, 비슷함 공개,
 * 스트릭·통계 잠금 해제·인사이트 카드·달력 넘기기(주입 상태), 판 내용이 카드 안에서 잘리지 않음. 목 모드 전용.
 */
import { CASE, entry, eventsOf, expect, MOCK_KEY, type MockJudgment, type MockState, mockState, mouseAway, openGate, skipOnboarding, test, top } from "./helpers";

test("되돌리기 창 중 다른 탭 → 결과 대기 → 돌아오면 공개 · 한 장 더 · 비슷함(±1%p)", async ({ page }) => {
  await skipOnboarding(page, { "bokgi.mock.deck4": "1" });
  await page.goto("/");
  await page.waitForSelector("#stage .sc");

  await openGate(page, 0, 1);
  await page.click("#btnR");
  await mouseAway(page);
  await expect(page.locator("#toast #undo")).toBeVisible();
  await page.click('#nav button[data-v="journal"]');
  await expect(page.locator(".jstate--wait"), "되돌리기 창 중 떠나면 공개 없이 보내 둔다").toHaveCount(1);
  await expect(page.locator(".jrow-title")).toHaveText("소프트웨어 · 대형");
  const waitRow = await page.locator(".jrow").innerText();
  expect(waitRow).not.toMatch(/어도비|ADBE/);
  await expect(page.locator(".cal-day--today.cal-day--done")).toHaveCount(1);
  await expect(page.locator(".cal-cap")).toHaveText(/^이달 연습 1일/);
  let st = await mockState(page);
  expect(st.judgments).toHaveLength(1);
  expect(st.judgments[0].revealedAt).toBeNull();
  await page.waitForTimeout(2800);
  await expect(page.locator(".jlist"), "다른 탭에서 공개 화면이 끼어들지 않는다").toHaveCount(1);
  await page.click('#nav button[data-v="today"]');
  await expect(page.locator(".reveal .name")).toHaveText(/^어도비/);

  for (let i = 0; i < 2; i++) {
    await page.click("#next");
    await page.waitForSelector("#stage .sc");
    await openGate(page, 0, 2);
    await page.click("#btnL");
    await page.click("#toast #now");
    await page.waitForSelector(".reveal .name");
  }
  await page.click("#next");
  await expect(page.locator(".done-title")).toHaveText("오늘은 여기까지");
  await expect(page.locator("#more")).toHaveCount(1);
  let en = await entry(page);
  expect(en.sub).toBe("오늘 끝 · 한 장 더 가능");
  expect(en.streak).toBe("스트릭 1일");

  await page.click("#more");
  await page.waitForSelector("#stage .sc");
  expect(await top(page)).toContain("한 장 더");
  en = await entry(page);
  expect(en.sub).toBe("오늘 끝 · 한 장 더 보는 중");
  const extra = await eventsOf(page, "extra_card");
  expect(extra).toHaveLength(1);
  expect(extra[0].caseId).toBe(CASE.c4);

  await openGate(page, 1, 3);
  await page.click("#btnR");
  await page.click("#toast #now");
  await page.waitForSelector(".reveal .name");
  await expect(page.locator(".verdict")).toContainText("거의 같았어요 — 적중·실패로 세지 않아요");
  await expect(page.locator(".verdict .ds-stamp--even")).toHaveCount(1);
  await expect(page.locator(".ds-nums b").nth(2)).toHaveText("■+0.4%p");
  expect(await page.locator(".ds-nums div:nth-child(3) b").getAttribute("class")).not.toContain("ds-");
  st = await mockState(page);
  expect(st.judgments[3]).toMatchObject({ isExtra: true, caseId: CASE.c4 });
  expect(st.judgments[3].result).toMatchObject({ state: "even", hit: null });
  await expect(page.locator("#explain .ex-line--read")).toContainText("시장 대비 +0.4%p로 시장과 거의 같았어요");
  await expect(page.locator("#explain .ex-line--concept .ds-hl")).toHaveCount(1);
  await page.click("#next");
  await expect(page.locator(".done-title")).toBeVisible();
  expect(await top(page)).toMatch(/^오늘 3\/3 \+1/);
  await expect(page.locator(".exhausted")).toBeVisible();   // 덱이 바닥났다
});

/** 프로토타입 스모크 B의 주입 자료 그대로(인사이트 문장이 같아야 한다) */
function injected(): MockJudgment[] {
  const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(12, 0, 0, 0); return x; };
  const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const cases = [CASE.c1, CASE.c2, CASE.c3];
  let n = 0;
  const mk = (caseId: string, at: Date, ev: string, conf: number, state: "ahead" | "behind" | "even", hit: boolean | null, recognized = false): MockJudgment => ({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, caseId, caseVersion: 1, keyEvidenceId: "ev1", keyEvidence: ev,
    riskId: null, risk: null, direction: "outperform", confidence: conf, recognized, panelsViewed: ["numbers"], gesture: { via: "button" }, isExtra: false,
    createdAt: at.toISOString(), localDate: key(at), revealedAt: at.toISOString(), selfCheck: null,
    result: { relativePp: state === "even" ? 0.5 : hit ? 3 : -3, state, hit },
  });
  const out = [mk(CASE.c1, d(4), "매출 +23%", 3, "behind", false), mk(CASE.c2, d(2), "부채비율 88%", 4, "ahead", true), mk(CASE.c3, d(1), "PER 24 vs 21", 2, "even", null)];
  const evs = ["매출 +23%", "PER 38 vs 27", "부채비율 88%", "가이던스 하향"];
  for (let i = 0; i < 21; i++) {
    const state = i % 6 === 0 ? "even" : i % 2 ? "ahead" : "behind";
    const hit = state === "even" ? null : i % 3 === 1;
    out.push(mk(cases[i % 3], d(30 - i), evs[i % 4], 5, state, hit, i % 5 === 0));
  }
  return out;
}

test("스트릭 · 통계 잠금 해제 · 인사이트 카드 · 달력 넘기기 (주입 상태)", async ({ page }) => {
  await skipOnboarding(page);
  const judgments = injected();
  const base: MockState = { v: 1, onboarded: true, judgments: judgments.slice(0, 3), progress: {}, attempts: [], sessions: {}, reports: [], events: [] };
  await page.addInitScript(({ k, s }) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s)); }, { k: MOCK_KEY, s: base });
  await page.goto("/");
  await expect(page.locator(".done-title")).toHaveText("준비된 카드를 모두 봤어요");
  const en = await entry(page);
  expect(en.streak, "어제·그제 연속, 나흘 전은 끊김 → 2일").toBe("스트릭 2일");
  expect(en.sub).toBe("남은 카드 없음");
  expect(await top(page)).not.toContain("스트릭");

  // 판단 24장(비슷 4장 포함) → 잠금 해제
  await page.evaluate(({ k, all }) => {
    const s = JSON.parse(localStorage.getItem(k) ?? "{}");
    s.judgments = all;
    localStorage.setItem(k, JSON.stringify(s));
  }, { k: MOCK_KEY, all: judgments });
  await page.reload();
  await page.click('#nav button[data-v="journal"]');
  await page.waitForSelector("details.stats");
  const dates = await page.locator(".jrow-date").allInnerTexts();
  const expected = [...judgments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((j) => `${+j.localDate.slice(5, 7)}월 ${+j.localDate.slice(8, 10)}일`);
  expect(dates, "일지는 최신순").toEqual(expected);
  await expect(page.locator("details.stats summary")).toHaveText("통계 (지금 24장)");
  await page.click("details.stats summary");
  await expect.poll(() => page.locator("details.stats").evaluate((d) => (d as HTMLDetailsElement).open)).toBe(true);
  const ins = await page.locator(".stats-body .ds-insight p").allInnerTexts();
  expect(ins).toEqual([
    "확신도 5를 준 판단 21번 중 시장보다 앞선 것은 10번이었어요.",
    "'매출'을 근거로 한 판단 7번 중 5번이 시장보다 뒤졌어요.",
    "아는 회사 판단 5번과 모르는 회사 판단 19번의 앞섬 횟수는 2번·9번이었어요.",
  ]);
  await expect(page.locator(".stats-body .ds-insight-kind")).toHaveText(["확신도", "근거", "아는 회사"]);
  const statsText = await page.locator(".stats-body").innerText();
  expect(statsText, "통계에 % 없음").not.toContain("%");
  expect(await page.evaluate(() => [...document.querySelectorAll(".ds-insight p")].every((p) => parseFloat(getComputedStyle(p).fontSize) <= 14 && !p.querySelector("b, strong"))), "큰 숫자 없음").toBe(true);
  expect(statsText).toContain("확신이 근거보다 앞서는 편이에요");
  await expect.poll(async () => (await eventsOf(page, "stats_toggle")).some((e) => e.payload?.open === true && e.payload?.unlocked === true)).toBe(true);

  // 달력: 이번 달 → ‹ 이전 달 → › 이번 달 (판단이 30일 전까지 있다)
  const cur = await page.evaluate(() => { const t = new Date(); return { title: `${t.getFullYear()}년 ${t.getMonth() + 1}월`, prevMonth: new Date(t.getFullYear(), t.getMonth() - 1, 1).getMonth() + 1, prevTitle: (() => { const p = new Date(t.getFullYear(), t.getMonth() - 1, 1); return `${p.getFullYear()}년 ${p.getMonth() + 1}월`; })() }; });
  await expect(page.locator("#cal-title")).toHaveText(cur.title);
  await expect(page.locator(".cal-cap")).toHaveText(/^이달 연습 \d+일 · 복습 0개$/);
  const hasPrev = await page.locator("#cal-prev").isEnabled();
  if (hasPrev) {
    await page.click("#cal-prev");
    await expect(page.locator("#cal-title")).toHaveText(cur.prevTitle);
    await expect(page.locator(".cal-cap")).toHaveText(new RegExp(`^${cur.prevMonth}월 연습 \\d+일 · 복습 0개$`));
    await expect(page.locator(".cal-day--today")).toHaveCount(0);
    await expect.poll(async () => (await eventsOf(page, "calendar_month")).some((e) => e.payload?.shift === -1)).toBe(true);
    expect(await page.evaluate(() => ["cal-prev", "cal-title"].includes(document.activeElement?.id ?? "")), "달을 넘긴 뒤 초점이 달력 머리에").toBe(true);
    const dots = await page.locator(".cal-day--done .cal-n").allInnerTexts();
    const prevKey = await page.evaluate(() => { const t = new Date(); const p = new Date(t.getFullYear(), t.getMonth() - 1, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`; });
    const want = [...new Set(judgments.filter((j) => j.localDate.startsWith(prevKey)).map((j) => +j.localDate.slice(8, 10)))].sort((a, b) => a - b);
    expect(dots.map(Number)).toEqual(want);
    await page.click("#cal-next");
    await expect(page.locator("#cal-title")).toHaveText(cur.title);
    await expect(page.locator("#cal-next")).toBeDisabled();
  }
});

test("판 내용이 카드 안에서 잘리지 않는다(카드 3장 × 판 3개, 380px)", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  const over: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.waitForSelector("#stage .sc");
    for (const k of ["numbers", "flow", "then"]) {
      await page.locator(`#stage .sc:last-child .panel-tabs button[data-panel="${k}"]`).click();
      const m = await page.evaluate(() => {
        const p = document.querySelector("#stage .sc:last-child .panel") as HTMLElement;
        return { id: (document.querySelector("#stage .sc:last-child .meta") as HTMLElement).innerText.split(" · ")[0], sh: p.scrollHeight, ch: p.clientHeight };
      });
      if (m.sh > m.ch) over.push(`${m.id}/${k}: ${m.sh}>${m.ch}`);
    }
    await openGate(page, 0, 3);
    await page.click("#btnR");
    await page.click("#toast #now");
    await page.waitForSelector(".reveal .name");
    await page.click("#next");
  }
  expect(over, "판 안쪽 스크롤 없이 들어간다").toEqual([]);
});
