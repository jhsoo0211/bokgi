/**
 * 정보 수준(D16, 02 §7.1) — 2026-10-04 2차. 목 모드 전용.
 * 온보딩 넷째 장 → 그 깊이로 시작 · 초급은 PBR·FCF·시장선·위험 칩이 DOM에 없음(판단의 hiddenGroups = 아홉 묶음, riskId null)
 * · 고급은 전부 · 묶음 하나를 바꾸면 사용자 지정 · 카드를 고르는 중에 바꾸면 다음 카드부터 · '더 보기'는 이 카드에서만(hiddenGroups = [])
 * · 설정 시트 초점 가두기·Esc·inert · 되돌리기 시간 · 저장 실패 시 되돌림.
 */
import { eventsOf, expect, GROUPS, mockState, mouseAway, openGate, panelText, prefsOf, PRESET, seedMock, skipOnboarding, test, type Group } from "./helpers";

/** 지금 카드를 → 로 판단하고 바로 공개, 다음 카드로 */
async function judgeAndNext(page: import("@playwright/test").Page) {
  await page.click("#btnR");
  await page.click("#toast #now");
  await page.waitForSelector(".reveal .name");
  await page.click("#next");
  await page.waitForSelector("#stage .sc, .done-title");
}

test("온보딩 넷째 장: 고른 수준을 저장하고 그 깊이로 시작한다", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 3; i++) await page.click("#onb-next");
  await expect(page.locator(".onb-step")).toHaveText("4 / 4");
  await page.click('.onb-opt[data-level="advanced"]');   // 재무제표를 읽어요
  await page.waitForSelector("#stage .sc");
  const st = await mockState(page);
  expect(st.prefs).toEqual(prefsOf("advanced"));
  expect((await eventsOf(page, "onboarding_done"))[0].payload).toEqual({ infoLevel: "advanced" });
  await expect(page.locator("#info-level")).toHaveText("정보 수준 · 전부");
  const nums = await panelText(page, "numbers");
  for (const s of ["PBR", "PSR", "순현금", "잉여현금흐름"]) expect(nums, `고급: ${s}`).toContain(s);
  await expect(page.locator("#expand"), "숨긴 묶음이 없으면 '더 보기'도 없다").toHaveCount(0);
});

test("초급 「핵심만」: PBR·FCF·시장선·위험 칩이 DOM에 없고, 판단에 수준과 숨긴 묶음이 남는다", async ({ page }) => {
  await skipOnboarding(page);
  await seedMock(page, { prefs: prefsOf("basic") });
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  await expect(page.locator("#info-level")).toHaveText("정보 수준 · 핵심만");
  // 숫자 판(지금 카드 + 엿보기 두 장 모두): 핵심 숫자만, 끈 묶음은 DOM에 없다(근거 칩은 스택 밖이라 그대로)
  const stageText = () => page.locator("#stage").evaluate((e) => e.textContent ?? "");
  let txt = await stageText();
  for (const s of ["매출 성장률", "영업이익률 추이", "PER"]) expect(txt, `있음: ${s}`).toContain(s);
  for (const s of ["PBR", "PSR", "순현금", "잉여현금흐름", "부채비율", "EPS 성장률", "가이던스", "재무건전성"]) expect(txt, `없음: ${s}`).not.toContain(s);
  // 흐름 판: 지수 경로만(시장 비교선·거래량 없음)
  await panelText(page, "flow");
  await expect(page.locator("#stage .ln-bench")).toHaveCount(0);
  await expect(page.locator("#stage .sc:last-child .spark polyline")).toHaveCount(1);
  txt = await stageText();
  expect(txt).not.toContain("거래량 추세");
  expect(txt).not.toMatch(/시장 \d/);
  // 그때 판: 금리 + 이슈는 공시·통계 우선 2개
  await panelText(page, "then");
  await expect(page.locator("#stage .sc:last-child .ctx-notes li")).toHaveCount(2);
  await expect(page.locator("#stage .sc:last-child .ctx-notes .ds-label")).toHaveText(["통계", "공시"]);
  await expect(page.locator("#stage .sc:last-child .blk-h").last()).toContainText("공시·통계 우선 2개");
  // 위험 칩은 묻지 않는다(선택 입력), 근거 칩은 모든 수준에서 전부
  await expect(page.locator("#risk")).toHaveCount(0);
  await expect(page.locator("#risk-q")).toHaveCount(0);
  await expect(page.locator("#ev .ds-chip")).toHaveCount(5);
  await expect(page.locator("#expand")).toHaveText("핵심만 보고 있어요 · 더 보기");

  await openGate(page, 0, 3);
  await page.click("#btnR");
  await page.click("#toast #now");
  await page.waitForSelector(".reveal .name");
  const j = (await mockState(page)).judgments[0];
  expect(j.infoLevel).toBe("basic");
  expect(j.hiddenGroups).toEqual([...GROUPS]);
  expect(j.riskId).toBeNull();
});

test("고급 「전부」: 묶음이 전부 보이고 숨긴 묶음이 없다", async ({ page }) => {
  await skipOnboarding(page);
  await seedMock(page, { prefs: prefsOf("advanced") });
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  const nums = await panelText(page, "numbers");
  for (const s of ["매출 성장률", "EPS 성장률", "가이던스", "PER", "PBR", "PSR", "부채비율", "순현금", "잉여현금흐름"]) expect(nums, s).toContain(s);
  const flow = await panelText(page, "flow");
  expect(flow).toContain("거래량 추세");
  expect(flow).toMatch(/시장 \d/);
  await expect(page.locator("#stage .sc:last-child .spark .ln-bench")).toHaveCount(1);
  await expect(page.locator("#stage .sc:last-child .legend .ln-bench")).toHaveCount(1);
  await panelText(page, "then");
  await expect(page.locator("#stage .sc:last-child .ctx-notes li")).toHaveCount(3);
  await expect(page.locator("#risk .ds-chip")).toHaveCount(3);
  await expect(page.locator("#expand")).toHaveCount(0);
  await openGate(page, 1, 4);
  await page.locator("#risk .ds-chip").nth(1).click();
  await page.click("#btnL");
  await page.click("#toast #now");
  await page.waitForSelector(".reveal .name");
  expect((await mockState(page)).judgments[0]).toMatchObject({ infoLevel: "advanced", hiddenGroups: [], riskId: "rk2" });
});

test("묶음 하나를 켜면 '사용자 지정' → 저장하면 머리줄 '지정', 손대기 전 카드에는 바로 적용", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  await expect(page.locator("#info-level")).toHaveText("정보 수준 · 기본");
  await page.click("#info-level");
  const sheet = page.locator('.sheet--lv[role="dialog"]');
  await expect(sheet).toBeVisible();
  await expect(page.locator('input[name="lvl"]')).toHaveCount(3);   // 프리셋 셋(사용자 지정 칸은 그때만 나온다)
  await expect(page.locator('input[name="lvl"][value="standard"]')).toBeChecked();
  await expect(page.locator('input[name="grp"]')).toHaveCount(9);
  // 묶음은 INFO_GROUPS 순서, 중급 프리셋 값 그대로
  expect(await page.locator('input[name="grp"]').evaluateAll((els) => els.map((e) => [(e as HTMLInputElement).value, (e as HTMLInputElement).checked]))).toEqual(GROUPS.map((g) => [g, PRESET.standard[g]]));
  await expect(page.locator("#lv-next"), "손대기 전 카드라 '다음 카드부터' 안내 없음").toHaveCount(0);
  await page.check('input[data-g="valuationDetail"]');
  await expect(page.locator('input[name="lvl"][value="custom"]')).toBeChecked();
  await expect(page.locator(".sheet--lv")).toContainText("사용자 지정");
  // 다시 끄면 프리셋과 같아져 중급으로 돌아간다(levelForPrefs)
  await page.uncheck('input[data-g="valuationDetail"]');
  await expect(page.locator('input[name="lvl"][value="standard"]')).toBeChecked();
  await expect(page.locator('input[name="lvl"][value="custom"]')).toHaveCount(0);
  // 세 묶음을 켜면 고급과 같아져 고급으로
  for (const g of ["valuationDetail", "healthDetail", "fxCommodity"] satisfies Group[]) await page.check(`input[data-g="${g}"]`);
  await expect(page.locator('input[name="lvl"][value="advanced"]')).toBeChecked();
  await page.uncheck('input[data-g="fxCommodity"]');
  await expect(page.locator('input[name="lvl"][value="custom"]')).toBeChecked();
  await page.click("#lv-save");
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#info-level")).toHaveText("정보 수준 · 지정");
  await expect(page.locator("#info-level")).toBeFocused();   // 닫으면 연 단추로
  const want = { ...PRESET.standard, valuationDetail: true, healthDetail: true };
  await expect.poll(async () => (await mockState(page)).prefs).toEqual(prefsOf("custom", want));
  // 손대기 전 카드라 바로 적용: PBR·순현금이 보이고, 환율·원자재만 숨김 → '더 보기' 줄은 사용자 지정 문구
  const nums = await panelText(page, "numbers");
  expect(nums).toContain("PBR");
  expect(nums).toContain("잉여현금흐름");
  await expect(page.locator("#expand")).toHaveText("고른 정보만 보고 있어요 · 더 보기");
  await openGate(page, 0, 3);
  await page.click("#btnR");
  await page.click("#toast #now");
  await page.waitForSelector(".reveal .name");
  expect((await mockState(page)).judgments[0]).toMatchObject({ infoLevel: "custom", hiddenGroups: ["fxCommodity"] });
});

test("카드를 고르는 중에 바꾸면 그 카드는 그대로, 다음 카드부터 적용된다", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  await page.locator("#ev .ds-chip").first().click();   // 손댔다 → 이 카드의 깊이(중급)가 고정
  await page.click("#info-level");
  await expect(page.locator("#lv-next")).toHaveText("바뀐 설정은 다음 카드부터 적용돼요.");
  await page.check('input[name="lvl"][value="basic"]');
  await page.click("#lv-save");
  await expect(page.locator("#info-level")).toHaveText("정보 수준 · 핵심만");
  expect(await panelText(page, "numbers")).toContain("부채비율");   // 지금 카드는 중급 그대로
  await expect(page.locator("#risk .ds-chip")).toHaveCount(3);
  await page.locator("#conf button").nth(2).click();
  await judgeAndNext(page);
  expect((await mockState(page)).judgments[0]).toMatchObject({ infoLevel: "standard", hiddenGroups: ["valuationDetail", "healthDetail", "fxCommodity"] });
  // 다음 카드부터 초급
  expect(await panelText(page, "numbers")).not.toContain("부채비율");
  await expect(page.locator("#risk")).toHaveCount(0);
  // 새로고침해도 고르던 카드의 깊이는 남는다(draft에 고정)
  await page.locator("#ev .ds-chip").first().click();
  await page.click("#info-level");
  await page.check('input[name="lvl"][value="advanced"]');
  await page.click("#lv-save");
  await page.reload();
  await page.waitForSelector("#stage .sc");
  await expect(page.locator("#info-level")).toHaveText("정보 수준 · 전부");
  expect(await panelText(page, "numbers"), "고르던 카드는 새로고침 뒤에도 초급").not.toContain("PBR");
});

test("'더 보기': 이 카드에서만 전부 펼치고 판단의 hiddenGroups는 [] — 다음 카드는 다시 핵심만", async ({ page }) => {
  await skipOnboarding(page);
  await seedMock(page, { prefs: prefsOf("basic") });
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  expect(await panelText(page, "numbers")).not.toContain("PBR");
  await page.click("#expand");
  await expect(page.locator("#expanded-note")).toBeFocused();   // 누른 단추가 사라져 초점은 바뀐 안내로
  await expect(page.locator("#expanded-note")).toHaveText("이 카드에서만 전부 펼쳐 보고 있어요");
  await expect(page.locator("#expand")).toHaveCount(0);
  expect(await panelText(page, "numbers")).toContain("PBR");
  await expect(page.locator("#risk .ds-chip")).toHaveCount(3);
  const ex = await eventsOf(page, "panel_expand");
  expect(ex).toHaveLength(1);
  expect(ex[0].payload).toMatchObject({ level: "basic" });
  expect((ex[0].payload?.hidden as string[]).length).toBe(9);
  await openGate(page, 0, 2);
  await page.locator("#risk .ds-chip").first().click();
  await judgeAndNext(page);
  expect((await mockState(page)).judgments[0]).toMatchObject({ infoLevel: "basic", hiddenGroups: [], riskId: "rk1" });
  expect((await mockState(page)).prefs?.infoLevel, "설정은 그대로 초급").toBe("basic");
  await expect(page.locator("#expand")).toHaveText("핵심만 보고 있어요 · 더 보기");
  expect(await panelText(page, "numbers")).not.toContain("PBR");
});

test("설정 시트: 초점 가두기·Esc·뒤 화면 inert, 시트 안 화살표는 판단하지 않는다, 되돌리기 시간 5초", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  await page.focus("#info-level");
  await page.keyboard.press("Enter");
  const sheet = page.locator('.sheet--lv[role="dialog"]');
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await expect(sheet).toHaveAttribute("aria-labelledby", "lv-title");
  await expect(page.locator('input[name="lvl"][value="standard"]')).toBeFocused();   // 고른 수준에 초점
  expect(await page.evaluate(() => (document.querySelector(".phone") as HTMLElement).inert)).toBe(true);
  expect(await eventsOf(page, "info_level_open")).toHaveLength(1);
  await page.keyboard.press("Shift+Tab");   // 첫 칸(수준 묶음)에서 Shift+Tab → 마지막 칸(저장)
  await expect(page.locator("#lv-save")).toBeFocused();
  await page.keyboard.press("Tab");          // 마지막 칸에서 Tab → 처음으로
  await expect(page.locator('input[name="lvl"][value="standard"]')).toBeFocused();
  for (let i = 0; i < 14; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest(".sheet")), "Tab을 여러 번 눌러도 시트 안").toBe(true);
  const blockedBefore = (await eventsOf(page, "gate_blocked")).length;
  await page.focus('input[name="undo"][value="2.5"]');
  await page.keyboard.press("ArrowRight");   // 라디오 이동(5초) — 뒤 화면의 판단 단축키가 아니다
  await expect(page.locator('input[name="undo"][value="5"]')).toBeChecked();
  expect((await eventsOf(page, "gate_blocked")).length, "시트 안 화살표는 판단으로 새지 않는다").toBe(blockedBefore);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#info-level")).toBeFocused();
  expect(await page.evaluate(() => (document.querySelector(".phone") as HTMLElement).inert)).toBe(false);
  expect((await mockState(page)).prefs?.undoSeconds, "Esc는 저장하지 않는다").toBe(2.5);

  // 저장: 되돌리기 알림이 5초 동안 떠 있다(2.5초가 지나도 공개되지 않는다)
  await page.click("#info-level");
  await page.check('input[name="undo"][value="5"]');
  await page.click("#lv-save");
  await expect.poll(async () => (await mockState(page)).prefs?.undoSeconds).toBe(5);
  await openGate(page, 0, 3);
  await page.click("#btnR");
  await mouseAway(page);
  await page.waitForTimeout(3200);
  await expect(page.locator("#toast #undo")).toBeVisible();
  expect((await mockState(page)).judgments).toHaveLength(0);
  await expect(page.locator(".reveal .name")).toHaveText(/^어도비/, { timeout: 4000 });
});

test("설정 저장이 실패하면 화면을 되돌리고 알린다(낙관적 저장)", async ({ page }) => {
  await skipOnboarding(page, { "bokgi.mock.failPrefs": "1" });
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  await page.click("#info-level");
  await page.check('input[name="lvl"][value="advanced"]');
  await page.click("#lv-save");
  await expect(page.locator('.top-err[role="alert"]')).toContainText("정보 수준을 저장하지 못했어요");
  await expect(page.locator("#info-level")).toHaveText("정보 수준 · 기본");
  expect(await panelText(page, "numbers")).not.toContain("PBR");
  expect((await mockState(page)).prefs?.infoLevel).toBe("standard");
});
