/**
 * 코드 리뷰 규칙을 소스 검사로 막는다(브라우저 없이, 목·실제 공통):
 * 1. 판단 전 컴포넌트(src/components/prereveal)는 결과 자료 필드를 가져오거나 그리지 않는다(계약의 PublicCase에는 없다).
 * 2. 결과색(ds-up/ds-down, --up/--down)과 형광펜(ds-hl)은 공개 컴포넌트(src/components/reveal)에서만 쓴다.
 * 3. 적중률 숫자를 만들지 않는다(화면 문구의 '적중'은 정해 둔 두 문장뿐).
 * 4. 목 모듈(예시 카드의 결과 자료 포함)은 api.ts의 운영 빌드에서 지워지는 가지에서만 읽는다.
 * 5. 버튼과 키보드 대체 입력(← →)이 늘 있다.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

function files(dir: string, exts = [".ts", ".tsx"]): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}
/** 주석을 뺀 코드(설명 글에 규칙 낱말이 들어가도 걸리지 않게) */
const code = (p: string) => fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const rel = (p: string) => path.relative(ROOT, p);

test("판단 전 컴포넌트는 결과 자료를 읽지도 그리지도 않는다", () => {
  const outcomeFields = /\b(companyName|ticker|returnPct|benchReturnPct|benchName|pricePath|benchPath|relativePp|keyPoints|linkSentence|startDate|endDate|Outcome|Reveal|explain)\b|reveal\/|mockData|lib\/client\/mock\b/;
  const bad = files(path.join(SRC, "components", "prereveal")).flatMap((p) => {
    const m = code(p).match(outcomeFields);
    return m ? [`${rel(p)}: ${m[0]}`] : [];
  });
  expect(files(path.join(SRC, "components", "prereveal")).length).toBeGreaterThan(0);
  expect(bad).toEqual([]);
});

test("결과색·형광펜은 공개 컴포넌트에서만", () => {
  const colors = /ds-up|ds-down|ds-hl|--up\b|--down\b/;
  const bad = files(path.join(SRC, "components"))
    .filter((p) => !p.includes(`${path.sep}reveal${path.sep}`))
    .flatMap((p) => { const m = code(p).match(colors); return m ? [`${rel(p)}: ${m[0]}`] : []; });
  expect(bad).toEqual([]);
  const css = fs.readFileSync(path.join(SRC, "styles", "app.css"), "utf8");
  expect(css.match(/var\(--(up|down)\)/g), "app.css는 상승·하락 색 변수를 쓰지 않는다").toBeNull();
});

test("적중률 숫자를 만들지 않는다", () => {
  const allowed = ["적중·실패로 세지 않아요", "적중률은 점수가 아니에요"];
  const bad = files(path.join(SRC, "components")).flatMap((p) => {
    const lines = code(p).split("\n").filter((l) => l.includes("적중") && !allowed.some((a) => l.includes(a)));
    return lines.map((l) => `${rel(p)}: ${l.trim().slice(0, 60)}`);
  });
  expect(bad).toEqual([]);
  const hitMath = files(path.join(SRC, "components")).flatMap((p) => (/hit\w*\s*\/|hitRate|accuracy|정답률/.test(code(p)) ? [rel(p)] : []));
  expect(hitMath).toEqual([]);
});

test("목 모듈은 운영 빌드에서 지워지는 가지에서만 읽는다", () => {
  const importers = files(SRC).filter((p) => /from\s+["'][^"']*\/mock(Data)?["']|import\(\s*["'][^"']*\/mock(Data)?["']\s*\)/.test(code(p))).map(rel).sort();
  expect(importers).toEqual(["src/lib/client/api.ts", "src/lib/client/mock.ts"].sort());
  const api = code(path.join(SRC, "lib", "client", "api.ts"));
  expect(api).toMatch(/if \(process\.env\.NODE_ENV !== "production" && process\.env\.NEXT_PUBLIC_USE_MOCK === "1"\) \{\s*return import\("\.\/mock"\)/);
});

test("판단 버튼 두 개와 키보드 ← → 대체 입력이 있다", () => {
  const card = code(path.join(SRC, "components", "prereveal", "CardScreen.tsx"));
  for (const s of ['id="btnL"', 'id="btnR"', 'aria-keyshortcuts="ArrowLeft"', 'aria-keyshortcuts="ArrowRight"', '"ArrowLeft"', '"ArrowRight"', "aria-disabled={!open}"]) {
    expect(card, s).toContain(s);
  }
  expect(card, "막힌 판단 버튼은 disabled가 아니라 aria-disabled").not.toMatch(/id="btn[LR]"[^>]*\sdisabled[=\s>]/);
});
