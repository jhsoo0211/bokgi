/**
 * 접근성(ecc UX 감사의 '고친 것' 유지 + '남은 것' 구현): 키보드만으로 카드 한 장, 알림 초점 동안 되돌리기 타이머 멈춤,
 * 모션 감소, 화면별 h1·제목 순서, axe(WCAG 2.x A·AA), 누르는 자리 40px 이상, 초점이 아래 탭에 가리지 않음. 목 모드 전용.
 */
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, expectHeadingOrder, expectNoOutcomeInDom, mockState, mouseAway, openGate, skipOnboarding, test } from "./helpers";

const AXE = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

async function axe(page: Page, label: string) {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  // 아래 고정 탭 밑으로 지나가는 내용을 target-size가 '가려짐'으로 세지 않게, 재는 동안만 고정을 푼다(초점 가림은 scroll-padding-bottom이 막는다)
  const v = await page.evaluate(async () => {
    const unstick = document.createElement("style");
    unstick.textContent = "#nav{position:static!important}";
    document.head.appendChild(unstick);
    const w = window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } };
    const r = await w.axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    unstick.remove();
    return r.violations.map((x) => `${x.id}(${x.impact}): ${x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  });
  expect(v, `axe ${label}`).toEqual([]);
}

/** 누르는 자리: 가운데를 지나는 가로·세로 선에서 elementFromPoint가 그 요소(또는 자식)인 길이(가상 요소 확장 포함) — ecc 감사 하네스와 같은 방식 */
async function hitAreas(page: Page, sel: string) {
  const r = await page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === "fixed").map((el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const inEl = (x: number, y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    const scan = (dx: number, dy: number, max: number) => { let d = 0; while (d < max && inEl(cx + dx * (d + 0.25), cy + dy * (d + 0.25))) d += 0.25; return d; };
    const h = scan(0, -1, b.height / 2 + 60) + scan(0, 1, b.height / 2 + 60), w = scan(-1, 0, b.width / 2 + 60) + scan(1, 0, b.width / 2 + 60);
    return { name: ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 16), w: +w.toFixed(1), h: +h.toFixed(1) };
  }), sel);
  await page.evaluate(() => window.scrollTo(0, 0));
  return r;
}
async function expectHits(page: Page, sels: string[]) {
  const small: string[] = [];
  for (const s of sels) {
    const list = await hitAreas(page, s);
    expect(list.length, `${s} 있음`).toBeGreaterThan(0);
    list.filter((x) => x.w < 40 || x.h < 40).forEach((x) => small.push(`${s} "${x.name}" ${x.w}×${x.h}`));
  }
  expect(small, "누르는 자리 40px 미만 없음").toEqual([]);
}

async function tabTo(page: Page, selector: string, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((s) => !!document.activeElement?.matches(s), selector)) return;
  }
  throw new Error(`Tab으로 ${selector}에 닿지 못함`);
}

test("키보드만으로 카드 한 장: Tab·Space·Enter → → 알림 초점 동안 멈춤 → Enter로 공개 → 신고 시트", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("view");   // 새 화면 틀로 초점

  // 초점 링(2px)과 초점이 아래 탭에 가리지 않는지(scroll-padding-bottom), 근거 칩 다섯 개를 Tab으로 지나며
  await tabTo(page, "#ev .ds-chip");
  const obscured: string[] = [];
  for (let i = 0; i < 5; i++) {
    const m = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement, cs = getComputedStyle(e);
      const r = e.getBoundingClientRect(), n = (document.querySelector("#nav") as HTMLElement).getBoundingClientRect();
      return { name: e.innerText.split("\n")[0], ring: `${cs.outlineStyle} ${cs.outlineWidth}`, fv: e.matches(":focus-visible"), under: Math.max(0, Math.min(r.bottom, n.bottom) - Math.max(r.top, n.top)) };
    });
    expect(m.fv).toBe(true);
    expect(m.ring).toBe("solid 2px");
    if (m.under > 0) obscured.push(`${m.name}: ${m.under}px`);
    if (i < 4) await page.keyboard.press("Tab");
  }
  expect(obscured, "Tab 초점이 아래 탭에 가리지 않는다").toEqual([]);

  // 두 번째 근거를 Space로, 확신도 4를 Enter로 (지금 초점은 다섯째 칩)
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#ev .ds-chip").nth(1)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator("#ev .ds-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
  await tabTo(page, "#conf button:nth-child(4)");
  await page.keyboard.press("Enter");
  await expect(page.locator('#conf button[aria-pressed="true"]')).toHaveText("4");
  await expect(page.locator("#btnR")).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#btnR")).toHaveAttribute("aria-keyshortcuts", "ArrowRight");
  await expect(page.locator("#btnL")).toHaveAttribute("aria-keyshortcuts", "ArrowLeft");
  await expect(page.locator("#conf")).toHaveAttribute("aria-describedby", "conf-scale");
  await expectNoOutcomeInDom(page);

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#toast #now")).toBeFocused();
  await page.waitForTimeout(3200);   // 초점이 알림에 있는 동안 2.5초가 지나도 공개되지 않는다(WCAG 2.2.1)
  await expect(page.locator(".reveal")).toHaveCount(0);
  expect((await mockState(page)).judgments).toHaveLength(0);
  await page.keyboard.press("Enter");
  await expect(page.locator(".reveal .name")).toHaveText(/^어도비/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("view");
  const j = (await mockState(page)).judgments[0];
  expect(j.gesture?.via).toBe("key");
  expect(j.direction).toBe("outperform");
  expect(j.keyEvidenceId).toBe("ev2");

  // 공개 화면: 확인 문제를 키보드로, 답한 뒤에도 초점이 남는다(aria-disabled)
  await tabTo(page, ".concept .opt");
  await page.keyboard.press("Enter");
  await expect(page.locator(".concept .quiz-fb")).not.toBeEmpty();
  await expect(page.locator(".concept .opt").first()).toBeFocused();
  // 신고 시트: 라디오는 화살표, 메모, 보내기
  await tabTo(page, "#flag");
  await page.keyboard.press("Enter");
  await expect(page.locator('.sheet input[name="cat"]').first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('.sheet input[value="identifiable"]')).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.locator("#rp-note")).toBeFocused();
  await page.keyboard.type("키보드로 남긴 신고");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator("#rp-send")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".sheet-back")).toHaveCount(0);
  await expect(page.locator('.report-line [role="status"]')).toBeFocused();
  expect((await mockState(page)).reports[0]).toMatchObject({ category: "identifiable", note: "키보드로 남긴 신고" });
  await tabTo(page, "#next");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#stage .sc");
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("view");
});

test("모션 감소: 카드가 날아가는 애니메이션 없이 바로 넘어간다", async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await skipOnboarding(page);
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  expect(await page.locator("#stage .sc").first().evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
  await openGate(page, 0, 3);
  const card = await page.$("#stage .sc:last-child");
  if (!card) throw new Error("no card");
  await page.click("#btnR");
  await mouseAway(page);
  await expect(page.locator("#toast #now")).toBeVisible({ timeout: 1500 });
  expect(await card.evaluate((el) => ({ connected: el.isConnected, transform: (el as HTMLElement).style.transform }))).toEqual({ connected: false, transform: "" });

  // 견줌: 모션 감소가 아니면 맨 위 카드가 옆으로 날아간다
  const ctx = await browser.newContext({ viewport: { width: 380, height: 760 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => localStorage.setItem("bokgi.onboarded", "1"));
  await p2.goto("/");
  await p2.waitForSelector("#stage .sc");
  await openGate(p2, 0, 3);
  const c2 = await p2.$("#stage .sc:last-child");
  if (!c2) throw new Error("no card");
  await p2.click("#btnR");
  expect(await c2.evaluate((el) => (el as HTMLElement).style.transform)).toMatch(/^translate\(/);
  await ctx.close();
});

test("화면별 h1 하나·제목 순서·axe(WCAG A·AA)·누르는 자리 40px", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#onb-next");
  await expectHeadingOrder(page, "온보딩");
  await axe(page, "온보딩");
  await page.keyboard.press("Tab");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Enter");   // 온보딩은 Enter만 이어 누르면 된다
  await page.waitForSelector("#stage .sc");

  await expectHeadingOrder(page, "카드");
  await axe(page, "카드");
  await expectHits(page, ["#nav button", "#stage .sc:last-child .panel-tabs button", "label.check", "#ev .ds-chip", "#risk .ds-chip", "#conf button", "#btnL, #btnR"]);
  await openGate(page, 0, 3);
  await page.click("#btnR");
  await mouseAway(page);
  await page.locator("#toast #now").waitFor();
  await page.locator("#toast").hover();
  await expectHits(page, ["#toast button"]);
  await axe(page, "되돌리기 알림");
  await page.click("#toast #now");
  await page.waitForSelector("#explain .ex-line");

  await expectHeadingOrder(page, "공개");
  await axe(page, "공개");
  await expectHits(page, [".ds-selfcheck button", ".concept .opt", "#flag", "#next"]);
  await page.click("#flag");
  await page.waitForSelector(".sheet");
  await axe(page, "신고 시트");
  await expectHits(page, [".sheet .radio", "#rp-cancel"]);
  await page.keyboard.press("Escape");

  await page.click('#nav button[data-v="journal"]');
  await page.waitForSelector("#cal");
  await expectHeadingOrder(page, "일지");
  await axe(page, "일지");
  await page.click("details.stats summary");
  await axe(page, "일지(통계 펼침)");
  await expectHits(page, [".cal-nav", "details.stats summary", "#export"]);

  await page.click('#nav button[data-v="concepts"]');
  await page.waitForSelector(".clist");
  await expectHeadingOrder(page, "개념");
  await axe(page, "개념");
  await expectHits(page, [".crow"]);
  await page.click(".crow >> nth=0");
  await page.waitForSelector(".concept .opt");
  await expectHeadingOrder(page, "개념 상세");
  await axe(page, "개념 상세");
  await expectHits(page, ["#back", ".concept .opt"]);
});

test("스와이프 도장 글자와 장식 기호는 보조기술에 읽히지 않는다", async ({ page }) => {
  await skipOnboarding(page);
  await page.goto("/");
  await page.waitForSelector("#stage .sc");
  const leaks = await page.evaluate(() => {
    const hidden = (e: Element) => !!e.closest('[aria-hidden="true"], [inert]');
    return [
      ...[...document.querySelectorAll(".sc-stamp")].filter((e) => !hidden(e)).map(() => "stamp"),
      ...[...document.querySelectorAll(".spark")].filter((e) => e.getAttribute("aria-hidden") !== "true").map(() => "spark"),
    ];
  });
  expect(leaks).toEqual([]);
});
