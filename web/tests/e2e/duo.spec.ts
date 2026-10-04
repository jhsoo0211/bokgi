/**
 * 듀오링고 흐름(D17)과 ecc 남은 것 — 2026-10-04 2차. 목 모드 전용.
 * 판단 막대(아래 고정, 두 단추 같은 무게, 막힘 → 열림) · 되돌리기는 방향만 취소(근거·확신도 유지) · 개념 길(네 갈래 × 다섯 노드,
 * 네 모양, 다음 복습 강조, 상세 열고 돌아오기, 길/목록 기억) · 일지 정보 수준 표시와 개념 이름 · 오늘 끝은 서버 자료(기기 기록 무시)
 * · 신고 clientReportId(시트를 열 때마다 새 값).
 */
import { CASE, eventsOf, expect, type MockJudgment, mockState, mouseAway, openGate, pageDays, prefsOf, seedMock, skipOnboarding, test, top } from "./helpers";

test("판단 막대: 아래 탭 위에 붙고, 두 단추는 같은 모양·무게, 막혔다가 근거·확신도를 고르면 함께 열린다", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  const geo = await page.evaluate(() => {
    const bar = document.querySelector("#judge") as HTMLElement, nav = document.querySelector("#nav") as HTMLElement, more = document.querySelector("#expand") as HTMLElement;
    const b = bar.getBoundingClientRect(), n = nav.getBoundingClientRect(), m = more.getBoundingClientRect();
    return { pos: getComputedStyle(bar).position, gapToNav: Math.round(n.top - b.bottom), barTop: b.top, inView: b.top >= 0 && b.bottom <= innerHeight, moreBottom: m.bottom };
  });
  expect(geo.pos).toBe("sticky");
  expect(geo.inView, "첫 화면에서 막대가 보인다").toBe(true);
  expect(Math.abs(geo.gapToNav), "막대는 아래 탭 바로 위(덮지 않음)").toBeLessThanOrEqual(1);
  expect(geo.moreBottom, "380×760 첫 화면에서 막대가 판 아래 '더 보기'를 덮지 않는다").toBeLessThanOrEqual(geo.barTop);

  const look = () => page.evaluate(() => ["#btnL", "#btnR"].map((s) => {
    const e = document.querySelector(s) as HTMLElement, cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return { cls: e.className, bg: cs.backgroundColor, color: cs.color, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, weight: cs.fontWeight, size: cs.fontSize, opacity: cs.opacity, w: Math.round(r.width), h: Math.round(r.height) };
  }));
  let [l, r] = await look();
  expect(l.cls).not.toContain("ds-btn--primary");
  expect(r.cls).not.toContain("ds-btn--primary");
  expect({ ...l, cls: "" }, "닫혀 있을 때 두 단추가 같다").toEqual({ ...r, cls: "" });
  expect(l.h).toBeGreaterThanOrEqual(44);
  await expect(page.locator("#btnL")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#btnR")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#judge")).toHaveAttribute("aria-labelledby", "judge-q");
  await expect(page.locator("#judge-q")).toHaveText("6개월 뒤, 이 회사는");

  // 막대에서 누르면: 흔들림 + 안내(막대 위 한 줄 + #hint) + 비어 있는 근거 칸이 보이게 스크롤, 판단은 나가지 않는다
  await page.locator("#btnR").click({ force: true });   // aria-disabled: 눌러도 초점을 잃지 않고 흔들림·안내
  await expect(page.locator("#ev")).toHaveClass(/shake/);
  await expect(page.locator(".judge-note")).toHaveText("먼저 근거 하나와 확신도를 골라 주세요");
  await expect(page.locator("#hint")).toHaveText("먼저 근거 하나와 확신도를 골라 주세요");
  await expect(page.locator("#btnR")).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const r = (document.querySelector("#ev") as HTMLElement).getBoundingClientRect(), bar = (document.querySelector("#judge") as HTMLElement).getBoundingClientRect();
    return r.top < bar.top && r.bottom > 0;
  }), { message: "근거 칸이 막대 위에 보인다" }).toBe(true);
  await expect(page.locator("#toast")).toBeEmpty();
  expect((await eventsOf(page, "gate_blocked")).length).toBe(1);

  await openGate(page, 0, 3);
  await expect(page.locator(".judge-note")).toHaveCount(0);
  await expect(page.locator("#btnL")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#btnR")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#judge")).toHaveClass(/judge-bar--open/);
  [l, r] = await look();
  expect({ ...l, cls: "" }, "열렸을 때도 두 단추가 같다").toEqual({ ...r, cls: "" });
  expect(l.opacity).toBe("1");
  // 스와이프·키보드도 그대로: ← 키로 판단
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#toast #now")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".reveal .name");
  expect((await mockState(page)).judgments[0]).toMatchObject({ direction: "underperform", gesture: { via: "key" } });
});

test("되돌리기: 방향만 취소하고 근거·위험·확신도·아는 회사는 남긴다", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  await page.check("#recog");
  await openGate(page, 1, 4);
  await page.locator("#risk .ds-chip").nth(2).click();
  await page.click("#btnR");
  await mouseAway(page);
  await expect(page.locator("#toast")).toContainText("시장보다 앞섰다 · 근거: PER 38 vs 27 · 확신 4/5");
  await expect(page.locator("#toast")).not.toContainText("망설임");
  await page.click("#toast #undo");
  await expect(page.locator("#toast")).toHaveText("되돌렸어요. 근거·확신도는 그대로 두었어요.");
  await expect(page.locator('#ev .ds-chip[aria-pressed="true"]')).toHaveAttribute("data-ev", "ev2");
  await expect(page.locator('#risk .ds-chip[aria-pressed="true"]')).toHaveAttribute("data-risk", "rk3");
  await expect(page.locator('#conf button[aria-pressed="true"]')).toHaveText("4");
  await expect(page.locator("#recog")).toBeChecked();
  await expect(page.locator("#btnR")).toBeFocused();   // 취소한 방향의 단추(막대에 붙어 있어 늘 보인다)
  await expect(page.locator("#btnL")).toHaveAttribute("aria-disabled", "false");
  expect((await mockState(page)).judgments).toHaveLength(0);
  // 반대 방향으로 다시: 같은 근거·확신도로 판단이 나간다
  await page.click("#btnL");
  await page.click("#toast #now");
  await page.waitForSelector(".reveal .name");
  const st = await mockState(page);
  expect(st.judgments).toHaveLength(1);
  expect(st.judgments[0]).toMatchObject({ direction: "underperform", keyEvidenceId: "ev2", riskId: "rk3", confidence: 4, recognized: true });
  expect(await eventsOf(page, "undo")).toHaveLength(1);
});

test("개념 길: 네 갈래 × 다섯 노드, 숙련도 네 모양 + 글자, 다음 복습 강조, 잠금 없음, 상세 → 초점 복귀, 길/목록 기억", async ({ page }) => {
  await skipOnboarding(page);
  const { today, yesterday, tomorrow } = await (async () => {
    const t = new Date(), k = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { today: k(t), yesterday: k(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1)), tomorrow: k(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) };
  })();
  const later = (n: number) => { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  await seedMock(page, {
    progress: {
      "abs-vs-relative": { state: "learning", level: 0, dueOn: tomorrow, correct: 1, total: 1 },
      "debt-and-cycle": { state: "review", level: 0, dueOn: yesterday, correct: 0, total: 1 },
      "fx-rates": { state: "learning", level: 1, dueOn: yesterday, correct: 1, total: 1 },
      "growth-vs-valuation": { state: "known", level: 2, dueOn: later(7), correct: 2, total: 2 },
    },
  });
  expect(today).not.toBe(yesterday);
  await page.goto("/");
  await page.waitForSelector("#stage .sc, .q");
  await page.click('#nav button[data-v="concepts"]');
  await page.waitForSelector("#cpath");
  await expect(page.locator("#cv-path")).toHaveAttribute("aria-pressed", "true");   // 기본은 길
  await expect(page.locator(".cbranch--path .cbranch-h")).toHaveText(["결과 읽기", "숫자 읽기", "그때 읽기", "내 판단 읽기"]);
  expect(await page.locator(".cpath").evaluateAll((ols) => ols.map((o) => o.querySelectorAll(".cnode").length))).toEqual([5, 5, 5, 5]);
  await expect(page.locator(".cpath").first().locator(".cnode-t")).toHaveText(["절대수익과 시장 대비", "기저확률과 노이즈", "기간과 변동성", "생존 편향", "최근성 편향"]);
  await expect(page.locator(".cpath").nth(1).locator(".cnode").nth(1)).toHaveAttribute("data-c", "growth-vs-valuation");   // 갈래 안 order 순
  // 네 모양(색이 아니라 윤곽·채움) + 글자
  const shapes = await page.evaluate(() => Object.fromEntries(["base-rate", "abs-vs-relative", "debt-and-cycle", "growth-vs-valuation"].map((id) => {
    const node = document.querySelector(`.cnode[data-c="${id}"]`) as HTMLElement, mk = node.querySelector(".cmk") as HTMLElement, cs = getComputedStyle(mk);
    return [id, { state: node.dataset.state, sig: `${cs.borderTopLeftRadius}|${cs.transform}|${cs.backgroundImage !== "none"}|${cs.backgroundColor}`, text: (node.querySelector(".cnode-s") as HTMLElement).innerText }];
  })));
  expect(shapes["base-rate"].state).toBe("new");
  expect(shapes["abs-vs-relative"].state).toBe("learning");
  expect(shapes["debt-and-cycle"].state).toBe("review");
  expect(shapes["growth-vs-valuation"].state).toBe("known");
  expect(new Set(Object.values(shapes).map((s) => s.sig)).size, "네 숙련도가 서로 다른 모양").toBe(4);
  expect(shapes["base-rate"].text).toContain("신규");
  expect(shapes["abs-vs-relative"].text).toContain("학습 중");
  expect(shapes["debt-and-cycle"].text).toContain("복습 필요");
  expect(shapes["growth-vs-valuation"].text).toContain("이해");
  // 다음 복습: 복습일이 가장 이른 개념(같으면 id 순 — debt-and-cycle < fx-rates) 하나만, 빨간 펜 고리 + 글자
  await expect(page.locator(".cnode--next")).toHaveCount(1);
  await expect(page.locator(".cnode--next")).toHaveAttribute("data-c", "debt-and-cycle");
  await expect(page.locator(".cnode--next .cnode-next")).toHaveText("다음 복습");
  expect(await page.locator(".cnode--next .cmk").evaluate((e) => getComputedStyle(e, "::before").borderTopColor)).toBe("rgb(215, 38, 61)");
  // 잠금·점수 없음: 모든 노드가 누를 수 있는 단추, 잠금·XP 글자 없음
  expect(await page.locator(".cnode").evaluateAll((els) => els.every((e) => !(e as HTMLButtonElement).disabled && e.getAttribute("aria-disabled") !== "true"))).toBe(true);
  expect((await page.locator(".cpath").allInnerTexts()).join(" ")).not.toMatch(/잠금|🔒|XP|점수|레벨/);
  await expect(page.locator(".cnode--next")).toContainText("다음 복습 복습 필요");   // 표시와 숙련도 글자가 붙어 읽히지 않게
  await expect(page.locator(".ds-hl, .ds-up, .ds-down")).toHaveCount(0);
  // 아직 배우지 않은(신규) 개념도 연다 — 순서는 안내일 뿐
  await page.click('.cnode[data-c="survivorship-bias"]');
  await expect(page.locator("#screen-title")).toHaveText("생존 편향");
  await expect(page.locator(".concept .opt")).toHaveCount(3);
  await page.click("#back");
  await expect(page.locator('.cnode[data-c="survivorship-bias"]'), "돌아오면 연 노드로 초점").toBeFocused();
  // 목록으로 바꾸면 기억한다(새로고침 뒤에도), 전환은 기록
  await page.click("#cv-list");
  await expect(page.locator(".crow")).toHaveCount(20);
  expect((await eventsOf(page, "concept_path_view")).map((e) => e.payload?.view)).toEqual(["list"]);
  await page.reload();
  await page.waitForSelector("#stage .sc, .q");
  await page.click('#nav button[data-v="concepts"]');
  await page.waitForSelector(".clist");
  await expect(page.locator("#cv-list")).toHaveAttribute("aria-pressed", "true");
  await page.click("#cv-path");
  await page.waitForSelector("#cpath");
  expect((await eventsOf(page, "concept_path_view")).map((e) => e.payload?.view)).toEqual(["list", "path"]);
});

test("일지: 판단 때의 정보 수준 표시(핵심만·전부·지정, 기본은 없음)와 공개 뒤 개념 이름", async ({ page }) => {
  await skipOnboarding(page);
  const at = (h: number) => { const d = new Date(); d.setDate(d.getDate() - 2); d.setHours(h, 0, 0, 0); return d; };
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mk = (n: number, caseId: string, infoLevel: MockJudgment["infoLevel"]): MockJudgment => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, caseId, caseVersion: 1, keyEvidenceId: "ev1", keyEvidence: "매출", riskId: null, risk: null,
    direction: "outperform", confidence: 3, recognized: false, panelsViewed: ["numbers"], gesture: { via: "button" }, isExtra: false, infoLevel, hiddenGroups: [],
    createdAt: at(9 + n).toISOString(), localDate: key(at(9 + n)), revealedAt: at(9 + n).toISOString(), selfCheck: null, result: { relativePp: -3, state: "behind", hit: false },
  });
  // 두 장은 이미 공개(고급·사용자 지정), 오늘 세트는 남은 한 장(소비재)
  await seedMock(page, { prefs: prefsOf("basic"), judgments: [mk(1, CASE.c1, "advanced"), mk(2, CASE.c2, "custom")] });
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  await openGate(page, 0, 3);
  await page.click("#btnR");
  await mouseAway(page);
  await expect(page.locator("#toast #undo")).toBeVisible();
  await page.click('#nav button[data-v="journal"]');   // 되돌리기 창 안에 떠남 → 결과 대기 행
  await page.waitForSelector(".jlist");
  const rows = page.locator(".jrow");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator(".jstate--wait")).toHaveCount(1);
  await expect(rows.nth(0).locator(".tag--lvl")).toHaveText("정보 수준 핵심만");
  await expect(rows.nth(0).locator(".jrow-concept"), "공개 전에는 개념 이름 없음").toHaveCount(0);
  await expect(rows.nth(1).locator(".tag--lvl")).toHaveText("정보 수준 지정");
  await expect(rows.nth(1).locator(".jrow-concept")).toHaveText("개념 높은 부채와 경기 민감도");
  await expect(rows.nth(2).locator(".tag--lvl")).toHaveText("정보 수준 전부");
  await expect(rows.nth(2).locator(".jrow-concept")).toHaveText("개념 절대수익과 시장 대비");
  // 공개하고 돌아오면 그 행에도 개념 이름
  await page.click('#nav button[data-v="today"]');
  await page.waitForSelector(".reveal .name");
  await page.click('#nav button[data-v="journal"]');
  await page.waitForSelector(".jlist");
  await expect(page.locator(".jrow").nth(0).locator(".jrow-concept")).toHaveText("개념 기저확률과 노이즈");
  await expect(page.locator(".jrow .ds-hl, .jrow .ds-up, .jrow .ds-down")).toHaveCount(0);
});

test("오늘 끝·머리줄은 서버 자료: 기기에 남은 옛 기록(bokgi.today.v1)은 읽지 않는다", async ({ page }) => {
  await skipOnboarding(page);
  const today = new Date();
  const k = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const t = (h: number, dayShift = 0) => { const d = new Date(today); d.setDate(d.getDate() + dayShift); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  const j = (n: number, caseId: string, revealedAt: string, localDate: string): MockJudgment => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, caseId, caseVersion: 1, keyEvidenceId: "ev1", keyEvidence: "매출", riskId: null, risk: null,
    direction: "outperform", confidence: 3, recognized: false, panelsViewed: ["numbers"], gesture: { via: "button" }, isExtra: false,
    createdAt: revealedAt, localDate, revealedAt, selfCheck: null, result: null,
  });
  const d = k(today);
  // 세 장 모두 오늘 판단·공개(공개 순서 c3 → c1 → c2) — 오늘 되짚은 개념은 그 순서, 개념당 한 번
  await page.addInitScript((dk) => {
    try { localStorage.setItem("bokgi.today.v1", JSON.stringify({ date: dk, concepts: ["fx-rates", "diversification"], reviewsDone: 2, extras: ["a", "b"] })); } catch { /* 무시 */ }
  }, d);
  await seedMock(page, {
    sessions: { [d]: { cards: [CASE.c1, CASE.c2, CASE.c3], extras: [] } },
    judgments: [j(1, CASE.c1, t(10), d), j(2, CASE.c2, t(11), d), j(3, CASE.c3, t(9), d)],
  });
  await page.goto("/");
  await expect(page.locator(".done-title")).toHaveText("오늘은 여기까지");
  expect(await top(page)).toMatch(/^오늘 3\/3 마침/);   // 기기 기록의 extras 2개(+2)를 더하지 않는다
  await expect(page.locator(".csum li b")).toHaveText(["기저확률과 노이즈", "절대수익과 시장 대비", "높은 부채와 경기 민감도"]);
  await expect(page.locator('[role="progressbar"]'), "기기 기록의 복습 2개를 칸으로 그리지 않는다").toHaveAttribute("aria-valuetext", "카드 3/3");
  const days = await pageDays(page);
  expect(days.today).toBe(d);
});

test("신고: 시트를 열 때마다 새 clientReportId(uuid)를 보낸다", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  for (let i = 0; i < 2; i++) {
    await page.waitForSelector("#stage .sc");
    await openGate(page, 0, 3);
    await page.click("#btnR");
    await page.click("#toast #now");
    await page.waitForSelector(".reveal .name");
    await page.click("#flag");
    await page.click('.sheet label.radio:has-text("데이터 오류")');
    await page.click("#rp-send");
    await expect(page.locator(".sheet-back")).toHaveCount(0);
    await page.click("#next");
  }
  const reports = (await mockState(page)).reports;
  expect(reports).toHaveLength(2);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  expect(reports.every((r) => uuidRe.test(r.clientReportId))).toBe(true);
  expect(reports[0].clientReportId).not.toBe(reports[1].clientReportId);
  expect(reports.map((r) => r.caseId)).toEqual([CASE.c1, CASE.c2]);
});
