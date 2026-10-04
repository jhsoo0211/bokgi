/**
 * 복기 e2e 공통. 목 모드(브라우저 안 목 API, localStorage 'bokgi.mock.v1')를 전제로 한다(canary.spec.ts 제외).
 * 프로토타입 스모크(prototype/tests/smoke.cjs)의 확인 항목을 React 앱에 맞게 옮겼다.
 */
import { expect, test as base, type Page } from "@playwright/test";

export const MOCK_KEY = "bokgi.mock.v1";
export const COMPANIES = ["어도비", "마이크론", "코카콜라", "테스트사"];
export const TICKERS = ["ADBE", "MU", "KO", "TST"];
export const CONCEPT_TITLES = ["절대수익과 시장 대비", "높은 성장률과 높은 밸류에이션", "높은 부채와 경기 민감도", "기저확률과 노이즈"];
export const CASE = {
  c1: "9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a01",
  c2: "9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a02",
  c3: "9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a03",
  c4: "9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a04",
};

export type MockResult = { relativePp: number; state: "ahead" | "behind" | "even"; hit: boolean | null };
export type Level = "basic" | "standard" | "advanced" | "custom";
export const GROUPS = ["marketLine", "volume", "growthDetail", "healthBasic", "valuationDetail", "healthDetail", "allNotes", "fxCommodity", "riskChips"] as const;
export type Group = (typeof GROUPS)[number];
export type MockPrefs = { infoLevel: Level; panelPrefs: Record<Group, boolean>; undoSeconds: 2.5 | 5 | 10 };
/** 계약 INFO_PRESETS와 같은 값(시험이 계약 모듈을 읽지 않고 기대값을 따로 갖는다) */
export const PRESET: Record<Exclude<Level, "custom">, Record<Group, boolean>> = {
  basic: Object.fromEntries(GROUPS.map((g) => [g, false])) as Record<Group, boolean>,
  standard: { marketLine: true, volume: true, growthDetail: true, healthBasic: true, valuationDetail: false, healthDetail: false, allNotes: true, fxCommodity: false, riskChips: true },
  advanced: Object.fromEntries(GROUPS.map((g) => [g, true])) as Record<Group, boolean>,
};
export type MockJudgment = {
  id: string; caseId: string; caseVersion: number; keyEvidenceId: string; keyEvidence: string; riskId: string | null; risk: string | null;
  direction: "outperform" | "underperform"; confidence: number; recognized: boolean; panelsViewed: string[];
  gesture: { via: string; dx?: number; ms?: number; v?: number; flips?: number } | null; isExtra: boolean;
  infoLevel?: Level; hiddenGroups?: Group[];
  createdAt: string; localDate: string; revealedAt: string | null; selfCheck: "o" | "tri" | "x" | null; result: MockResult | null;
};
export type MockState = {
  v: 1; onboarded: boolean; prefs?: MockPrefs; judgments: MockJudgment[];
  progress: Record<string, { state: string; level: number; dueOn: string | null; correct: number; total: number }>;
  attempts: { clientAttemptId: string; conceptId: string; via: string; localDate: string }[];
  sessions: Record<string, { cards: string[]; extras: string[] }>;
  reports: { clientReportId: string; caseId: string; caseVersion: number; category: string; note: string | null }[];
  events: { event: string; caseId: string | null; payload: Record<string, unknown> | null }[];
};

/** 콘솔 오류·페이지 오류가 하나라도 나면 시험 실패. Next 개발 표시(nextjs-portal)는 가린다(아래 탭을 덮지 않게) */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      await page.addInitScript(() => {
        const hide = () => {
          const s = document.createElement("style");
          s.textContent = "nextjs-portal{display:none!important}";
          document.documentElement.appendChild(s);
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hide);
        else hide();
      });
      await use();
      expect(errors, "콘솔 오류 없음").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const mockState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __bokgiMock: { state(): MockState } }).__bokgiMock.state());

export const eventsOf = async (page: Page, name: string) => (await mockState(page)).events.filter((e) => e.event === name);

/** 첫 실행 안내를 건너뛴 상태로 시작(목 서버의 onboarded 대체 표시) */
export async function skipOnboarding(page: Page, extra: Record<string, string> = {}) {
  await page.addInitScript((kv) => {
    try {
      localStorage.setItem("bokgi.onboarded", "1");
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
    } catch { /* 무시 */ }
  }, extra);
}

/** 처음 한 번만 목 상태를 넣는다(새로고침해도 다시 덮지 않게). 정보 수준만 바꾸려면 prefsOf() */
export async function seedMock(page: Page, state: Partial<MockState>) {
  await page.addInitScript(({ k, s }) => {
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, JSON.stringify({ v: 1, onboarded: true, judgments: [], progress: {}, attempts: [], sessions: {}, reports: [], events: [], ...s }));
  }, { k: MOCK_KEY, s: state });
}
export const prefsOf = (infoLevel: Level, panelPrefs?: Record<Group, boolean>, undoSeconds: MockPrefs["undoSeconds"] = 2.5): MockPrefs =>
  ({ infoLevel, panelPrefs: panelPrefs ?? PRESET[infoLevel === "custom" ? "standard" : infoLevel], undoSeconds });

/** 안내 1~3장을 넘기고 넷째 장(정보 수준)에서 고른다 */
export async function finishOnboarding(page: Page, level: Exclude<Level, "custom"> = "standard") {
  for (let i = 0; i < 3; i++) await page.click("#onb-next");
  await page.click(`.onb-opt[data-level="${level}"]`);
  await page.waitForSelector("#stage .sc");
}

/** 카드 앞면(지금 카드)의 판 글자 */
export async function panelText(page: Page, panel: "flow" | "numbers" | "then") {
  await page.locator(`#stage .sc:last-child .panel-tabs button[data-panel="${panel}"]`).click();
  return (await page.locator("#stage .sc:last-child .panel").innerText()).replace(/\s+/g, " ");
}

export async function entry(page: Page) {
  const e = page.locator(".ds-entry");
  return {
    lead: (await e.locator(".ds-entry-lead").innerText()).trim(),
    sub: (await e.locator(".ds-entry-sub").innerText()).trim(),
    streak: (await e.locator(".ds-streak").innerText()).trim(),
  };
}

export const top = async (page: Page) => (await page.locator(".top").first().innerText()).replace(/\s+/g, " ").trim();

export async function dragCard(page: Page, dx: number) {
  await page.locator("#stage").scrollIntoViewIfNeeded();
  const box = await page.locator("#stage .sc:last-child").boundingBox();
  if (!box) throw new Error("no card");
  const x = box.x + box.width / 2, y = box.y + box.height * 0.85;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

/** 근거(칩 순서)와 확신도를 고른다 */
export async function openGate(page: Page, evidence: number, confidence: number) {
  await page.locator("#ev .ds-chip").nth(evidence).click();
  await page.locator("#conf button").nth(confidence - 1).click();
}

/** 마우스를 알림 밖으로(포인터가 알림 위에 있으면 되돌리기 타이머가 멈춘다) */
export const mouseAway = (page: Page) => page.mouse.move(2, 2);

/** 판단 전 화면에 결과 자료·결과색·형광펜이 없다 */
export async function expectNoOutcomeInDom(page: Page) {
  const found = await page.evaluate(({ companies, tickers }) => {
    const html = document.body.innerHTML, text = document.body.innerText;
    return [
      ...companies.filter((c) => html.includes(c)),
      ...tickers.filter((t) => new RegExp(`\\b${t}\\b`).test(text)),
      ...["ds-up", "ds-down", "ds-hl"].filter((c) => document.querySelector(`[class~="${c}"]`) !== null || html.includes(c)),
    ];
  }, { companies: COMPANIES, tickers: TICKERS });
  expect(found, "판단 전 DOM에 회사·티커·결과색·형광펜 없음").toEqual([]);
}

/** 화면마다 h1은 하나, 제목 단계는 건너뛰지 않는다(h1 → h2 → h3) */
export async function expectHeadingOrder(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const hs = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => !h.closest("[hidden], [aria-hidden='true'], [inert]"));
    const levels = hs.map((h) => +h.tagName[1]);
    const skips: string[] = [];
    levels.forEach((l, i) => { if (i === 0 ? l !== 1 : l > levels[i - 1] + 1) skips.push(`${hs[i].tagName}:${(hs[i].textContent ?? "").slice(0, 16)}`); });
    return { h1: levels.filter((l) => l === 1).length, skips, levels };
  });
  expect(r.h1, `${label}: h1 하나 (${r.levels.join(",")})`).toBe(1);
  expect(r.skips, `${label}: 제목 단계 건너뜀 없음 (${r.levels.join(",")})`).toEqual([]);
}

/** 오늘·내일 날짜(브라우저 현지 = Asia/Seoul) */
export const pageDays = (page: Page) =>
  page.evaluate(() => {
    const k = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const t = new Date();
    const tm = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    const ym = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
    return { today: k(t), tomorrow: k(tm), yesterday: k(ym), tomorrowLabel: `내일 (${tm.getMonth() + 1}월 ${tm.getDate()}일)` };
  });
