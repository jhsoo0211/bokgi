/**
 * 처음 실행 → 판단 3장 → 공개(자기 평가·확인 문제·신고 시트 초점 가두기) → 오늘 끝 → 일지(달력·잠긴 통계) → 개념 → 복습.
 * 프로토타입 스모크 A(prototype/tests/smoke.cjs)를 React 앱으로 옮긴 것이다. 목 모드 전용.
 */
import { CASE, CONCEPT_TITLES, dragCard, entry, eventsOf, expect, expectHeadingOrder, expectNoOutcomeInDom, MOCK_KEY, mockState, mouseAway, openGate, pageDays, test, top } from "./helpers";

test("첫 실행 → 판단 3장 → 공개 → 오늘 끝 → 일지 → 개념 → 복습", async ({ page }) => {
  await page.goto("/");

  /* ---------- 온보딩 ---------- */
  await expect(page.locator(".onb-title")).toHaveText("복기는 주가 맞히기 게임이 아니에요");
  await expect(page.locator("#nav")).toBeHidden();
  await expectHeadingOrder(page, "온보딩");
  await page.click("#onb-next");
  await expect(page.locator(".onb-title")).toHaveText("하루 3장, 5분");
  await expect(page.locator("#onb-next")).toBeFocused();   // 2·3장은 Enter만 이어 누르면 된다
  await page.click("#onb-next");
  await expect(page.locator(".onb-title")).toHaveText("결과와 회사 이름은 판단한 뒤에만 보여요");
  await expect(page.locator("#onb-next")).toHaveText("다음");   // 2026-10-04: 넷째 장(정보 수준)이 생겨 셋째 장도 '다음'
  await page.click("#onb-next");
  // 넷째 장: 정보 수준(시험 아님) — 큰 단추 셋, 기본값(중급)에 초점, 나중에 바꿀 수 있다는 한 줄
  await expect(page.locator(".onb-title")).toHaveText("어느 정도 아세요?");
  await expect(page.locator(".onb-opt b")).toHaveText(["처음이에요", "기본 지표는 알아요", "재무제표를 읽어요"]);
  await expect(page.locator('.onb-opt[data-level="standard"]')).toBeFocused();
  await expect(page.locator(".onb-later")).toContainText("나중에 언제든 바꿀 수 있어요");
  await expectHeadingOrder(page, "온보딩 넷째 장");
  await page.click('.onb-opt[data-level="standard"]');
  await page.waitForSelector("#stage .sc");
  expect(await page.evaluate(() => localStorage.getItem("bokgi.onboarded"))).toBe("1");
  expect((await mockState(page)).onboarded).toBe(true);
  expect((await mockState(page)).prefs?.infoLevel).toBe("standard");
  expect(await eventsOf(page, "onboarding_done")).toHaveLength(1);
  await expect(page).toHaveTitle("복기");
  await expect(page.locator("#nav button")).toHaveText(["오늘", "일지", "개념"]);

  /* ---------- 카드 화면 (판단 전) ---------- */
  expect(await top(page)).toMatch(/^오늘 0\/3/);
  let en = await entry(page);
  // 스트릭 0일은 '0'을 내세우지 않고 비난 없는 초대 문구로(2026-10-04 UX 감사, 02 §6-4)
  expect(en).toEqual({ lead: "개념 이해 0/20 · 복습 예정 0개", sub: "오늘 남은 카드 3장", streak: "오늘 연습하면 스트릭 1일" });
  // 세션 진행: 카드 3칸(복습 기한 없음 → 복습 칸 없음), 보조기술에는 progressbar 하나
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute("aria-valuetext", "카드 0/3");
  await expect(page.locator(".ds-bar.seg i")).toHaveCount(3);
  expect(await page.evaluate(() => {
    const e = document.querySelector(".ds-entry"), s = document.querySelector("#stage");
    return !!e && !!s && !!(e.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && !e.querySelector("button, a");
  }), "입장 띠는 스택 위, 누르는 곳이 아니다").toBe(true);
  const bodyText = await page.locator("body").innerText();
  expect(CONCEPT_TITLES.filter((t) => bodyText.includes(t)), "카드 화면에 학습 포인트(개념) 없음").toEqual([]);
  await expectNoOutcomeInDom(page);
  await expectHeadingOrder(page, "카드");
  const tabs = page.locator("#stage .sc:last-child .panel-tabs button");
  await expect(page.locator('#stage .sc:last-child .panel-tabs button[aria-pressed="true"]')).toHaveText("숫자");
  await expect(page.locator("#stage .sc:last-child .panel")).not.toContainText("기준금리");
  await expect(page.locator("#btnL")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#btnR")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator('#conf button[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator("#hint")).toHaveText("근거 하나와 확신도를 고르면 판단할 수 있어요");
  await expect(page.locator("#btnL")).toHaveText(/^← 시장보다 뒤졌다/);
  await expect(page.locator("#btnR")).toHaveText(/^시장보다 앞섰다 →/);
  await expect(page.locator("#recog")).not.toBeChecked();
  await expect(page.locator("#ev .ds-chip").first()).toContainText("매출이 얼마나 빨리 느는지는 성장 기대의 출발점이에요.");   // 칩마다 왜 중요한지 한 줄
  await expect(page.locator("#ev .ds-chip-why")).toHaveCount(5);
  await expect(page.locator("#stage .sc")).toHaveCount(3);   // 지금 카드 + 엿보기 2장
  expect(await page.locator("#stage .sc.n1, #stage .sc.n2").evaluateAll((els) => els.every((e) => e.hasAttribute("inert")))).toBe(true);

  // 판 전환(포인터 캡처가 탭 클릭을 막지 않는다)
  await tabs.filter({ hasText: "그때" }).click();
  const ctx = await page.locator("#stage .sc:last-child .panel").innerText();
  expect(ctx).toContain("5.25%");
  await expect(page.locator("#stage .sc:last-child .ctx-notes li")).toHaveCount(3);
  expect(ctx).toMatch(/판단일 D-\d+/);
  expect(ctx.replace(/판단일 D-\d+/g, ""), "그때 판: 상대 날짜만").not.toMatch(/20\d\d|\d+월|\d+일(?!\s)/);
  await tabs.filter({ hasText: "흐름" }).click();
  await expect(page.locator("#stage .sc:last-child .panel .spark")).toHaveCount(1);
  await tabs.filter({ hasText: "숫자" }).click();
  expect((await eventsOf(page, "panel_view")).map((e) => e.payload?.panel)).toEqual(["then", "flow", "numbers"]);
  expect(await eventsOf(page, "card_view")).toHaveLength(1);

  /* ---------- 게이트: 고르기 전 스와이프·키보드·버튼 막힘 ---------- */
  await dragCard(page, 230);
  expect((await mockState(page)).judgments).toHaveLength(0);
  await expect(page.locator("#hint")).toHaveText(/^먼저/);
  await expect(page.locator("#toast")).toBeEmpty();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  await expect(page.locator("#toast")).toBeEmpty();
  await page.locator("#btnR").click({ force: true });   // aria-disabled: 눌러도 흔들림과 안내가 나온다
  await expect(page.locator("#ev")).toHaveClass(/shake/);
  await expect(page.locator("#hint")).toHaveText("먼저 근거 하나와 확신도를 골라 주세요");
  await expect(page.locator("#btnR")).toBeFocused();   // disabled가 아니라 초점을 잃지 않는다
  expect((await eventsOf(page, "gate_blocked")).length).toBeGreaterThanOrEqual(3);
  await page.locator("#ev .ds-chip").first().click();
  await expect(page.locator("#btnR")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#hint")).toHaveText("확신도를 고르면 판단할 수 있어요");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#conf")).toHaveClass(/shake/);   // 흔들림(320ms)이 끝나면 클래스가 빠지므로 기다리기 전에 본다
  await page.waitForTimeout(300);
  await expect(page.locator("#toast")).toBeEmpty();
  await page.check("#recog");
  await page.locator("#risk .ds-chip").first().click();
  await page.locator("#conf button").nth(2).click();
  await expect(page.locator("#btnR")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#btnL")).toHaveAttribute("aria-disabled", "false");
  await expectNoOutcomeInDom(page);

  // 다른 탭에 다녀와도 고르던 것이 남는다(draft 보존), card_view는 다시 세지 않는다
  // (일지는 아직 비어 있다: 내보내기 대신 '오늘 카드 판단하러 가기' 안내 단추 하나 — 그 단추로 돌아온다)
  await page.click('#nav button[data-v="journal"]');
  await page.waitForSelector("#cal");
  await expect(page.locator("#export"), "기록이 없으면 내보내기를 숨긴다").toHaveCount(0);
  await expect(page.locator(".empty #go-today")).toHaveText("오늘 카드 판단하러 가기");
  await page.click("#go-today");
  await page.waitForSelector("#stage .sc");
  await expect(page.locator('#nav button[data-v="today"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator('#ev .ds-chip[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('#ev .ds-chip[aria-pressed="true"]')).toContainText("매출 +23%");
  await expect(page.locator('#risk .ds-chip[aria-pressed="true"]')).toHaveText("밸류에이션 프리미엄");
  await expect(page.locator('#conf button[aria-pressed="true"]')).toHaveText("3");
  await expect(page.locator("#recog")).toBeChecked();
  expect(await eventsOf(page, "card_view")).toHaveLength(1);
  // 같은 탭에서 새로고침해도 고르던 것이 남는다(sessionStorage, 카드 id@버전 열쇠)
  await page.reload();
  await page.waitForSelector("#stage .sc");
  await expect(page.locator('#ev .ds-chip[aria-pressed="true"]')).toContainText("매출 +23%");
  await expect(page.locator('#conf button[aria-pressed="true"]')).toHaveText("3");
  await expect(page.locator("#recog")).toBeChecked();

  /* ---------- → 버튼으로 판단, 2.5초 뒤 자동 공개 ---------- */
  await page.click("#btnR");
  await mouseAway(page);
  await expect(page.locator("#toast #undo")).toBeVisible();
  expect((await page.locator("#toast").innerText()).replace(/\s+/g, " ")).toMatch(/^시장보다 앞섰다 · 근거: 매출 \+23% · 확신 3\/5/);
  await expect(page.locator("#toast #now")).toHaveText("바로 공개");
  expect(await page.locator("#gate").evaluate((el) => (el as HTMLFieldSetElement).disabled), "되돌리기 창 동안 게이트 잠금").toBe(true);
  await expect(page.locator("#btnR")).toHaveAttribute("aria-disabled", "true");
  expect((await mockState(page)).judgments, "되돌리기 창 동안에는 아직 보내지 않는다").toHaveLength(0);
  await expectNoOutcomeInDom(page);
  await expect(page.locator(".reveal .name")).toHaveText("어도비 (ADBE)", { timeout: 6000 });

  /* ---------- 공개 ---------- */
  await expectHeadingOrder(page, "공개");
  // 학습 먼저: '내 판단 되짚기'(사후에 중요했던 것·내 근거)가 시장 대비 결과(도장·수치)보다 앞에 온다. '다음'은 개념 카드부터 붙는 막대 안
  expect(await page.evaluate(() => {
    const after = (a: string, b: string) => !!(document.querySelector(a)!.compareDocumentPosition(document.querySelector(b)!) & Node.DOCUMENT_POSITION_FOLLOWING);
    return [after(".mine", ".verdict"), after(".verdict", ".ds-nums"), after("#after-row", ".ds-nums"), !!document.querySelector(".reveal-tail .concept ~ .act-bar #next"), getComputedStyle(document.querySelector(".act-bar")!).position];
  })).toEqual([true, true, true, true, "sticky"]);
  await expect(page.locator(".mine .ds-card-title")).toHaveText("내 판단 되짚기");
  await expect(page.locator("#explain .ex-line--read")).toContainText("시장 대비 −2.3%p");
  await expect(page.locator(".ds-nums b")).toHaveText(["▲+4.8%", "▲+7.1%", "▼−2.3%p"]);
  await expect(page.locator(".ds-nums b.ds-up")).toHaveCount(2);
  await expect(page.locator(".ds-nums b.ds-down")).toHaveCount(1);
  const verdict = await page.locator(".verdict").innerText();
  expect(verdict).toContain("뒤짐");
  expect(verdict).toContain("시장보다 2.3%p 뒤졌어요");
  expect(verdict).toContain("판단한 방향과 달라요");
  const mine = await page.locator(".mine").innerText();
  expect(mine).toMatch(/사후에 중요했던 것\s+절대수익과 시장 대비/);
  expect(mine).toContain("알고 판단");
  await expect(page.locator("#after-row .kp-list li")).toHaveCount(3);   // 카드의 keyPoints(사후에 중요했던 것의 근거)
  await expect(page.locator(".reveal .period")).toHaveText("2023 Q3 → 2024 Q1 · 예시 자료");   // 출처 kind "예시" → 꼬리표
  await expect(page.locator(".sources li")).toHaveCount(4);                                        // 가격·공시·통계·보도
  await expect(page.locator(".sources li").first()).toContainText("배당 재투자·분할 반영");
  await expect(page.locator(".concept .concept-link")).toHaveText("이 회사는 4.8% 올랐지만 시장이 7.1% 올라, 시장 대비로는 2.3%p 뒤졌어요.");
  let st = await mockState(page);
  expect(st.judgments).toHaveLength(1);
  expect(st.judgments[0]).toMatchObject({ recognized: true, caseId: CASE.c1, keyEvidenceId: "ev1", riskId: "rk1", confidence: 3, direction: "outperform" });
  expect(st.judgments[0].gesture?.via).toBe("button");
  expect(st.judgments[0].result).toMatchObject({ state: "behind", hit: false });
  expect(st.judgments[0].panelsViewed.sort()).toEqual(["flow", "numbers", "then"]);

  // 해설 세 줄: 머리글·라벨·면책, 개념 줄이 마지막이고 가장 진함
  const ex = await page.evaluate(() => {
    const lines = [...document.querySelectorAll("#explain .ex-line")];
    const fw = (e: Element) => +getComputedStyle(e).fontWeight, fs = (e: Element) => parseFloat(getComputedStyle(e).fontSize);
    const s = (l: Element) => l.querySelector(".ex-s") as HTMLElement;
    return {
      heads: lines.map((l) => (l.querySelector(".ex-h") as HTMLElement).innerText),
      labels: lines.map((l) => (l.querySelector(".ex-s .ds-label") as HTMLElement).innerText),
      sentences: lines.map((l) => s(l).innerText),
      warn: lines.map((l) => !!l.querySelector(".warn")),
      lastIsConcept: lines[lines.length - 1].classList.contains("ex-line--concept") && !lines[lines.length - 1].nextElementSibling,
      conceptHl: (lines[2]?.querySelector(".ds-hl") as HTMLElement | null)?.innerText ?? "",
      stronger: lines.length === 3 && fw(s(lines[2])) > fw(s(lines[0])) && fs(s(lines[2])) >= fs(s(lines[0])),
    };
  });
  expect(ex.heads).toEqual(["이번에 잘 읽은 것", "다음에 바꿀 것", "개념 연결"]);
  expect(ex.labels).toEqual(["📄 출처", "🔍 추론", "📄 출처"]);
  expect(ex.warn).toEqual([false, true, false]);
  expect(ex.lastIsConcept && ex.stronger).toBe(true);
  expect(ex.conceptHl).toBe("절대수익과 시장 대비");
  expect(ex.sentences.every((x) => (x.replace(/^\S+ \S+ /, "").match(/[.?!](\s|$)/g) ?? []).length === 1), "줄마다 한 문장").toBe(true);
  const strayNums = await page.evaluate(() => {
    const nums = (s: string) => s.match(/\d+(?:\.\d+)?/g) ?? [];
    const shown = new Set(nums(`${(document.querySelector(".ds-nums") as HTMLElement).innerText} ${(document.querySelector(".mine") as HTMLElement).innerText}`));
    return nums((document.querySelector("#explain") as HTMLElement).innerText).filter((n) => !shown.has(n));
  });
  expect(strayNums, "숫자 가드: 해설 숫자는 공개 화면에 나온 숫자뿐").toEqual([]);
  const hl = await page.evaluate(() => [...document.querySelectorAll(".ds-hl")].map((e) =>
    `${e.closest("#after-row") ? "after" : e.closest(".ex-line--concept") ? "explain" : e.closest(".concept .ds-card-title") ? "concept" : "OTHER"}:${(e as HTMLElement).innerText}`));
  expect(hl).toEqual(["after:절대수익과 시장 대비", "explain:절대수익과 시장 대비", "concept:절대수익과 시장 대비"]);

  // ○△✕ 자기 평가 (난이도 2): 사후에 중요했던 것 바로 아래, 기본 선택 없음
  const sc = await page.evaluate(() => {
    const box = document.querySelector("#selfcheck");
    return box && {
      under: document.querySelector("#after-row")?.nextElementSibling === box,
      q: (box.querySelector(".selfcheck-q") as HTMLElement).innerText,
      btns: [...box.querySelectorAll(".ds-selfcheck button")].map((b) => (b as HTMLElement).innerText),
      pressed: box.querySelectorAll('[aria-pressed="true"]').length,
    };
  });
  expect(sc).toEqual({ under: true, q: "내 근거는 이 개념과 맞았나요?", btns: ["○ 맞았다", "△ 일부", "✕ 달랐다"], pressed: 0 });
  await page.click('.ds-selfcheck button[data-v="o"]');
  await page.click('.ds-selfcheck button[data-v="tri"]');
  await expect(page.locator('.ds-selfcheck button[aria-pressed="true"]')).toHaveText("△ 일부");
  await expect.poll(async () => (await mockState(page)).judgments[0].selfCheck).toBe("tri");
  expect(await page.locator('.ds-selfcheck button[aria-pressed="true"]').evaluate((b) => getComputedStyle(b, "::after").borderTopColor)).toBe("rgb(215, 38, 61)");
  await expect(page.locator(".selfcheck-fb")).toHaveText(/^기록했어요/);
  expect(await page.locator("#selfcheck").innerText()).not.toMatch(/점수|\d+\s*점|%/);

  /* ---------- 신고 시트: 초점 가두기·뒤 화면 inert·Esc ---------- */
  await page.click("#flag");
  const sheet = page.locator('.sheet[role="dialog"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".sheet input[type=radio]")).toHaveCount(8);
  await expect(page.locator("#rp-send")).toBeDisabled();
  await expect(page.locator('.sheet input[name="cat"]').first()).toBeFocused();
  expect(await page.evaluate(() => (document.querySelector(".phone") as HTMLElement).inert)).toBe(true);
  await page.keyboard.press("Shift+Tab");   // 첫 칸에서 Shift+Tab → 시트의 마지막 칸(밖으로 새지 않는다)
  await expect(page.locator("#rp-cancel")).toBeFocused();
  await page.keyboard.press("Tab");          // 마지막 칸에서 Tab → 처음으로
  await expect(page.locator('.sheet input[name="cat"]').first()).toBeFocused();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest(".sheet")), "Tab을 여러 번 눌러도 시트 안").toBe(true);
  expect((await eventsOf(page, "report_open")).length).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".sheet-back")).toHaveCount(0);
  await expect(page.locator("#flag")).toBeFocused();
  expect(await page.evaluate(() => (document.querySelector(".phone") as HTMLElement).inert)).toBe(false);
  await page.click("#flag");
  await page.click('.sheet label.radio:has-text("기업 유추 가능")');
  await page.fill("#rp-note", "업종과 가이던스로 회사를 짐작할 수 있었어요");
  await page.click("#rp-send");
  await expect(page.locator(".sheet-back")).toHaveCount(0);
  st = await mockState(page);
  expect(st.reports).toHaveLength(1);
  expect(st.reports[0]).toMatchObject({ category: "identifiable", caseId: CASE.c1, caseVersion: 1, note: "업종과 가이던스로 회사를 짐작할 수 있었어요" });
  await expect(page.locator('.report-line [role="status"]')).toBeFocused();
  await expect(page.locator(".report-line")).toContainText("신고를 남겼어요");

  /* ---------- 공개 화면 퀴즈(정답) → 복습 level 0, 내일 ---------- */
  const days = await pageDays(page);
  await page.click('.concept .opt[data-i="1"]');
  await expect(page.locator(".concept .quiz-fb")).toHaveText(`맞아요. 다음 복습: ${days.tomorrowLabel}`);
  st = await mockState(page);
  expect(st.progress["abs-vs-relative"]).toMatchObject({ level: 0, dueOn: days.tomorrow, state: "learning" });
  await expect(page.locator(".concept .opt.ok")).toHaveCount(1);

  /* ---------- 카드 2: 키보드 ← → 바로 공개 ---------- */
  await expect(page.locator("#next")).toHaveText("다음 카드 →");
  await page.click("#next");
  await page.waitForSelector("#stage .sc");
  expect(await top(page)).toMatch(/^오늘 1\/3/);
  en = await entry(page);
  expect(en).toEqual({ lead: "개념 이해 0/20 · 복습 예정 0개", sub: "오늘 남은 카드 2장", streak: "스트릭 1일" });
  await expectNoOutcomeInDom(page);
  await openGate(page, 2, 4);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#toast #now")).toBeFocused();   // 키보드로 판단하면 초점이 [바로 공개]로
  const t0 = Date.now();
  await page.click("#toast #now");
  await expect(page.locator(".reveal .name")).toHaveText(/^마이크론/, { timeout: 1500 });
  expect(Date.now() - t0).toBeLessThan(1500);
  st = await mockState(page);
  expect(st.judgments[1]).toMatchObject({ direction: "underperform", keyEvidence: "부채비율 88%", confidence: 4 });
  expect(st.judgments[1].result?.hit).toBe(true);
  expect(st.judgments[1].gesture?.via).toBe("key");
  expect(await eventsOf(page, "reveal_now")).toHaveLength(1);
  await expect(page.locator(".verdict")).toContainText("판단한 방향과 같아요");
  await expect(page.locator("#explain .ex-line--read")).toContainText("고른 방향과 같았어요");
  await expect(page.locator("#explain .ex-line--change")).toContainText("위험 요인도 하나 골라");
  await page.click('.ds-selfcheck button[data-v="x"]');
  await expect.poll(async () => (await mockState(page)).judgments[1].selfCheck).toBe("x");
  await page.click('.concept .opt[data-i="1"]');   // 틀린 답(정답은 0)
  await expect(page.locator(".concept .opt.ok")).toHaveCount(1);
  await expect(page.locator(".concept .opt.no")).toHaveCount(1);
  await expect(page.locator(".concept .quiz-fb")).toHaveText(/^아니에요\. 정답: ‘이자 부담으로 이익이 빠르게 줄 수 있다’\. 다음 복습: /);
  st = await mockState(page);
  expect(st.progress["debt-and-cycle"]).toMatchObject({ level: 0, state: "review" });

  /* ---------- 카드 3: 되돌리기(알림 위 포인터 → 타이머 멈춤) → 다시 스와이프 ---------- */
  await page.click("#next");
  await page.waitForSelector("#stage .sc");
  await openGate(page, 0, 2);
  await page.click("#btnL");
  await page.locator("#toast").hover();          // 포인터가 알림 위에 있는 동안 2.5초 타이머가 멈춘다
  await page.waitForTimeout(3200);
  await expect(page.locator(".reveal")).toHaveCount(0);
  await expect(page.locator("#toast #undo")).toBeVisible();
  await page.click("#toast #undo");
  st = await mockState(page);
  expect(st.judgments, "되돌리기는 서버에 보내지 않는다").toHaveLength(2);
  expect(await eventsOf(page, "undo")).toHaveLength(1);
  // 2026-10-04(ecc 남은 것): 되돌리기는 방향만 취소 — 고른 근거·확신도는 남고, 초점은 취소한 방향의 판단 단추로
  await expect(page.locator('#ev .ds-chip[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('#conf button[aria-pressed="true"]')).toHaveText("2");
  await expect(page.locator("#btnL")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#stage .sc:last-child .meta")).toContainText("소비재");
  await expect(page.locator("#btnL")).toBeFocused();
  await expect(page.locator("#toast")).toHaveText("되돌렸어요. 근거·확신도는 그대로 두었어요.");
  await openGate(page, 1, 5);
  await dragCard(page, -230);
  await mouseAway(page);
  await expect(page.locator("#toast #now")).toBeVisible();
  await expect(page.locator("#toast"), "제스처 메타(망설임)는 기록만 — 알림에 보이지 않는다").not.toContainText("망설임");
  expect((await mockState(page)).judgments).toHaveLength(2);
  await page.click("#toast #now");
  await expect(page.locator(".reveal .name")).toHaveText(/^코카콜라/);
  st = await mockState(page);
  expect(st.judgments).toHaveLength(3);
  expect(st.judgments[2].gesture?.via).toBe("swipe");
  expect(st.judgments[2].direction).toBe("underperform");
  await expect(page.locator(".ds-selfcheck"), "난이도 1 카드는 개념 확인을 묻지 않는다").toHaveCount(0);
  expect(await page.locator(".ds-hl").count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#next")).toHaveText(/^계속/);

  /* ---------- 오늘 끝 ---------- */
  await page.click("#next");
  await expect(page.locator(".done-title")).toHaveText("오늘은 여기까지");
  await expectHeadingOrder(page, "오늘 끝");
  expect(await page.locator(".csum li").count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".exhausted")).toContainText("준비된 카드를 모두 봤어요");
  await expect(page.locator("#more")).toHaveCount(0);
  // 돌아올 이유 한 줄: 내일 복습 2개(정답 1·오답 1 모두 내일), 덱이 바닥나 새 카드는 약속하지 않는다
  await expect(page.locator(".comeback")).toHaveText("내일은 복습 2개가 준비돼요.");
  await expect(page.locator('[role="progressbar"]')).toHaveAttribute("aria-valuetext", "카드 3/3");
  en = await entry(page);
  expect(en.sub).toBe("오늘 끝");
  expect(en.streak).toBe("스트릭 1일");
  expect(await top(page)).toMatch(/^오늘 3\/3/);
  await expect(page.locator(".ds-hl")).toHaveCount(0);

  /* ---------- 일지 ---------- */
  await page.click('#nav button[data-v="journal"]');
  await page.waitForSelector(".jlist");
  await expectHeadingOrder(page, "일지");
  const rows = await page.locator(".jrow").allInnerTexts();
  expect(rows).toHaveLength(3);
  expect(rows[0]).toContain("코카콜라 (KO)");
  expect(rows[2]).toContain("어도비 (ADBE)");
  for (const s of ["알고 판단", "시장보다 앞섰다", "매출 +23%", "3/5", "뒤짐"]) expect(rows[2]).toContain(s);
  await expect(page.locator(".jrow .tag")).toHaveCount(1);
  await expect(page.locator("details.stats summary")).toHaveText("통계 (20장 뒤에 열려요 · 지금 3장)");
  expect(await page.locator("details.stats").evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  await expect(page.locator("#export")).toHaveCount(1);
  await expect(page.locator("#reset"), "실제 앱에는 세션 초기화가 없다").toHaveCount(0);
  await expect(page.locator(".ds-up, .ds-down, .ds-hl")).toHaveCount(0);
  const marks = await page.evaluate(() => [...document.querySelectorAll(".jrow")].map((r) => {
    const m = r.querySelector(".jmark");
    return m ? `${(m as HTMLElement).innerText}|${m.getAttribute("role")}|${m.getAttribute("aria-label")}` : "-";
  }));
  expect(marks).toEqual(["-", "✕|img|개념 확인: 달랐다", "△|img|개념 확인: 일부"]);
  expect(await page.locator(".screen").innerText()).not.toMatch(/[○△✕]\s*\d/);
  // 연습 달력
  const cal = await page.evaluate(() => {
    const t = new Date();
    return {
      title: (document.querySelector("#cal-title") as HTMLElement).innerText,
      expectTitle: `${t.getFullYear()}년 ${t.getMonth() + 1}월`,
      heads: [...document.querySelectorAll(".cal-grid th")].map((e) => (e as HTMLElement).innerText).join(""),
      afterTop: document.querySelector(".top")?.nextElementSibling?.id,
      today: [...document.querySelectorAll(".cal-day--today .cal-n")].map((e) => +(e as HTMLElement).innerText),
      todayDone: document.querySelectorAll(".cal-day--today.cal-day--done").length,
      due: [...document.querySelectorAll(".cal-day--due .cal-n")].map((e) => +(e as HTMLElement).innerText),
      classes: [...new Set([...document.querySelectorAll(".cal td")].flatMap((td) => [...td.classList]))],
      cap: (document.querySelector(".cal-cap") as HTMLElement).innerText,
      prevDisabled: (document.querySelector("#cal-prev") as HTMLButtonElement).disabled,
      nextDisabled: (document.querySelector("#cal-next") as HTMLButtonElement).disabled,
      ring: getComputedStyle(document.querySelector(".cal-day--today .cal-n") as Element, "::after").borderTopColor,
      dot: getComputedStyle(document.querySelector(".cal-day--done .cal-mk") as Element).backgroundColor,
      todayN: t.getDate(),
      sameMonthTomorrow: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).getMonth() === t.getMonth(),
    };
  });
  expect(cal.title).toBe(cal.expectTitle);
  expect(cal.heads).toBe("월화수목금토일");
  expect(cal.afterTop).toBe("cal");
  expect(cal.today).toEqual([cal.todayN]);
  expect(cal.todayDone).toBe(1);
  expect(cal.classes.every((c) => ["cal-day", "cal-day--done", "cal-day--due", "cal-day--today", "cal-day--future"].includes(c)), "달력은 결과로 칠하지 않는다").toBe(true);
  expect(cal.ring).toBe("rgb(215, 38, 61)");
  expect(cal.dot).toBe("rgb(28, 27, 26)");
  expect(cal.prevDisabled).toBe(true);
  if (cal.sameMonthTomorrow) {
    expect(cal.due).toEqual([cal.todayN + 1]);   // 복습 2개 모두 내일
    expect(cal.cap).toBe("이달 연습 1일 · 복습 2개");
    expect(cal.nextDisabled).toBe(true);
  } else {
    expect(cal.cap).toBe("이달 연습 1일 · 복습 0개");
    expect(cal.nextDisabled).toBe(false);
  }

  /* ---------- 개념(기본은 길 보기 → 목록으로 바꿔 줄을 확인) ---------- */
  await page.click('#nav button[data-v="concepts"]');
  await page.waitForSelector("#cpath");
  await expectHeadingOrder(page, "개념 길");
  await expect(page.locator(".cbranch-h")).toHaveText(["결과 읽기", "숫자 읽기", "그때 읽기", "내 판단 읽기"]);
  await page.click("#cv-list");
  await page.waitForSelector(".clist");
  await expectHeadingOrder(page, "개념 목록");
  await expect(page.locator(".cbranch-h")).toHaveText(["결과 읽기", "숫자 읽기", "그때 읽기", "내 판단 읽기"]);
  await expect(page.locator(".crow")).toHaveCount(20);
  const crow = async (id: string) => (await page.locator(`.crow[data-c="${id}"]`).innerText()).replace(/\s+/g, " ");
  expect(await crow("abs-vs-relative")).toContain("학습 중");
  expect(await crow("abs-vs-relative")).toContain("복습 예정: 내일");
  expect(await crow("debt-and-cycle")).toContain("복습 필요");
  expect(await crow("growth-vs-valuation")).toContain("신규");
  expect(await crow("growth-vs-valuation")).toContain("복습 예정 없음");
  await expect(page.locator(".ds-hl")).toHaveCount(0);
  await page.click('.crow[data-c="growth-vs-valuation"]');
  await page.waitForSelector(".concept .opt");
  await expectHeadingOrder(page, "개념 상세");
  await expect(page.locator(".ds-hl")).toHaveCount(0);
  await page.click('.concept .opt[data-i="1"]');
  await expect(page.locator(".concept .quiz-fb")).toHaveText(/^맞아요\./);
  st = await mockState(page);
  expect(st.progress["growth-vs-valuation"]).toMatchObject({ level: 0 });
  expect(st.attempts.some((a) => a.via === "concepts")).toBe(true);
  expect(await eventsOf(page, "concept_view")).toHaveLength(1);
  // 같은 날 다시 맞혀도 간격이 부풀지 않는다
  await page.click("#back");
  await expect(page.locator('.crow[data-c="growth-vs-valuation"]'), "목록으로 돌아오면 연 개념 줄로 초점이 돌아온다").toBeFocused();
  await page.click('.crow[data-c="growth-vs-valuation"]');
  await page.click('.concept .opt[data-i="1"]');
  await expect(page.locator(".concept .quiz-fb")).toHaveText(/^맞아요\./);
  st = await mockState(page);
  expect(st.progress["growth-vs-valuation"]).toMatchObject({ level: 0, state: "known" });

  /* ---------- 복습: 복습일을 어제로 당기고 새로고침 → 복습 문제(하루 2개) ---------- */
  await page.evaluate(({ k, y }) => {
    const s = JSON.parse(localStorage.getItem(k) ?? "{}");
    Object.values(s.progress as Record<string, { dueOn: string }>).forEach((p) => { p.dueOn = y; });
    localStorage.setItem(k, JSON.stringify(s));
  }, { k: MOCK_KEY, y: days.yesterday });
  await page.reload();
  await expect(page.locator(".top").first()).toContainText("복습 1/2");
  await expectHeadingOrder(page, "복습");
  en = await entry(page);
  expect(en.lead).toBe("개념 이해 1/20 · 복습 예정 2개");
  expect(en.sub).toBe("오늘 끝");
  await expect(page.locator("#next")).toBeDisabled();
  const rid = await page.locator(".q").innerText();
  expect(rid).toMatch(/^복습 · /);
  // 기한이 이른 순: 셋 다 어제라 id 순(abs-vs-relative)
  await page.click('.concept .opt[data-i="1"]');
  await expect(page.locator("#next")).toBeEnabled();
  await expect(page.locator("#next")).toBeFocused();
  st = await mockState(page);
  expect(st.progress["abs-vs-relative"].level, "기한 된 복습을 맞히면 level 1(3일)").toBe(1);
  await page.click("#next");
  await expect(page.locator(".top").first()).toContainText("복습 2/2");
  en = await entry(page);
  expect(en.lead.endsWith("· 복습 예정 1개")).toBe(true);
  await page.locator(".concept .opt").first().click();
  await page.click("#next");
  await expect(page.locator(".done-title")).toBeVisible();
  st = await mockState(page);
  expect(st.attempts.filter((a) => a.via === "review")).toHaveLength(2);
  expect(Object.values(st.progress).filter((p) => p.dueOn && p.dueOn <= days.today).length, "하루 2개 뒤에도 기한 된 개념이 남는다").toBeGreaterThanOrEqual(1);
  expect((await eventsOf(page, "review_view")).length).toBe(2);
});
