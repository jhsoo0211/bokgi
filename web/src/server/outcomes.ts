import "server-only";
import { Outcome, Index14, roundPp } from "@/shared/contract";
import { z } from "zod";
import { db, type Db } from "@/lib/server/db";
import { fromDbDate } from "@/lib/server/time";
import type { LeakDictionary } from "@/lib/server/ai/leakFilter";
import { numericTokens } from "@/lib/server/ai/numberGuard";
import type { CaseOutcome } from "@/server/generated/prisma/client";

/**
 * 공개 뒤(②)·서버 전용(③) 자료를 읽는 유일한 모듈. `server-only`라 클라이언트 번들에 들어가면 빌드가 깨진다.
 * 오늘·카드·일지의 결과 대기 행·질문자 생성 경로는 이 모듈의 결과 읽기 함수를 부르지 않는다.
 * 누수 사전은 여기서 런타임에 만든다(번들·public/에 두지 않는다).
 */

export type OutcomeT = z.infer<typeof Outcome>;

const Sources = z.array(z.object({ kind: z.string(), label: z.string(), url: z.string().nullable() }).strict());
const KeyPoints = z.array(z.string());
const LeakTerms = z.array(z.string());

export function num(d: { toNumber(): number } | number | null | undefined): number {
  if (d === null || d === undefined) return Number.NaN;
  return typeof d === "number" ? d : d.toNumber();
}

export function outcomeToContract(o: CaseOutcome): OutcomeT {
  return Outcome.parse({
    companyName: o.companyName,
    ticker: o.ticker,
    period: o.period,
    startDate: fromDbDate(o.startDate),
    endDate: fromDbDate(o.endDate),
    returnPct: num(o.returnPct),
    benchReturnPct: num(o.benchReturnPct),
    benchName: o.benchName,
    pricePath: Index14.parse(o.pricePath),
    benchPath: Index14.parse(o.benchPath),
    sources: Sources.parse(o.sources),
  });
}

export async function loadOutcome(caseId: string, version: number, client: Db = db()): Promise<CaseOutcome | null> {
  return client.caseOutcome.findUnique({ where: { caseId_version: { caseId, version } } });
}

export interface RevealExtras {
  keyPoints: string[];
  /** rank 순 학습 포인트(개념·문제 포함) */
  learning: {
    conceptId: string;
    rank: number;
    linkSentence: string;
    concept: { id: string; branch: "outcome" | "numbers" | "then" | "self"; title: string; bodyMd: string };
    quizzes: { id: string; ord: number; question: string; options: unknown }[];
  }[];
}

export async function loadRevealExtras(caseId: string, version: number, client: Db = db()): Promise<RevealExtras> {
  const [reveal, points] = await Promise.all([
    client.caseReveal.findUnique({ where: { caseId_version: { caseId, version } } }),
    client.caseLearningPoint.findMany({
      where: { caseId, version },
      orderBy: { rank: "asc" },
      include: { concept: { include: { quizzes: { where: { active: true }, orderBy: { ord: "asc" } } } } },
    }),
  ]);
  return {
    keyPoints: reveal ? KeyPoints.parse(reveal.keyPoints).slice(0, 3) : [],
    learning: points.map((p) => ({
      conceptId: p.conceptId,
      rank: p.rank,
      linkSentence: p.linkSentence,
      concept: { id: p.concept.id, branch: p.concept.branch, title: p.concept.title, bodyMd: p.concept.bodyMd },
      quizzes: p.concept.quizzes.map((q) => ({ id: q.id, ord: q.ord, question: q.question, options: q.options })),
    })),
  };
}

/** 일지의 공개된 행에만: 회사명·티커. 결과 대기 행의 카드 id는 넘기지 않는다. */
export async function loadOutcomeHeads(keys: { caseId: string; version: number }[], client: Db = db()): Promise<Map<string, { companyName: string; ticker: string }>> {
  const out = new Map<string, { companyName: string; ticker: string }>();
  if (keys.length === 0) return out;
  const rows = await client.caseOutcome.findMany({
    where: { OR: keys.map((k) => ({ caseId: k.caseId, version: k.version })) },
    select: { caseId: true, version: true, companyName: true, ticker: true },
  });
  for (const r of rows) out.set(`${r.caseId}:${r.version}`, { companyName: r.companyName, ticker: r.ticker });
  return out;
}

/**
 * 공개된 판단에만: 그 카드(버전)의 1순위 학습 포인트 개념(id·제목) — 일지의 conceptTitle, 오늘의 conceptsToday.
 * 학습 포인트는 공개 뒤 자료다. 호출자는 공개 전 판단의 카드 키를 넘기지 않는다(넘기면 학습 포인트가 공개 전에 샌다).
 * 키 = `${caseId}:${version}`.
 */
export async function loadLeadConcepts(keys: { caseId: string; version: number }[], client: Db = db()): Promise<Map<string, { conceptId: string; title: string }>> {
  const out = new Map<string, { conceptId: string; title: string }>();
  if (keys.length === 0) return out;
  const rows = await client.caseLearningPoint.findMany({
    where: { rank: 1, OR: keys.map((k) => ({ caseId: k.caseId, version: k.version })) },
    select: { caseId: true, version: true, conceptId: true, concept: { select: { title: true } } },
  });
  for (const r of rows) out.set(`${r.caseId}:${r.version}`, { conceptId: r.conceptId, title: r.concept.title });
  return out;
}

// ---------- 누수 사전 (server-only) ----------

interface DictCache {
  at: number;
  companies: { text: string; caseId: string }[];
  tickers: { text: string; caseId: string }[];
  perCase: Map<string, { terms: string[]; outcomeNumbers: number[]; cutoff: string | null }>;
}
let cache: DictCache | null = null;
const CACHE_MS = 60_000;

async function loadDictCache(client: Db): Promise<DictCache> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const [outcomes, internals] = await Promise.all([
    client.caseOutcome.findMany({ select: { caseId: true, version: true, companyName: true, ticker: true, startDate: true, returnPct: true, benchReturnPct: true, startPrice: true, endPrice: true, sectorReturnPct: true } }),
    client.caseInternal.findMany({ select: { caseId: true, version: true, leakTerms: true, dataCutoff: true } }),
  ]);
  const perCase = new Map<string, { terms: string[]; outcomeNumbers: number[]; cutoff: string | null }>();
  const companies: DictCache["companies"] = [];
  const tickers: DictCache["tickers"] = [];
  for (const o of outcomes) {
    companies.push({ text: o.companyName, caseId: o.caseId });
    tickers.push({ text: o.ticker, caseId: o.caseId });
    const ret = num(o.returnPct);
    const bench = num(o.benchReturnPct);
    const nums = [ret, bench, roundPp(ret - bench), num(o.startPrice), num(o.endPrice), num(o.sectorReturnPct)].filter(Number.isFinite);
    const entry = perCase.get(o.caseId) ?? { terms: [], outcomeNumbers: [], cutoff: null };
    entry.outcomeNumbers.push(...nums.map((n) => Math.abs(n)));
    const start = fromDbDate(o.startDate);
    entry.cutoff = entry.cutoff && entry.cutoff < start ? entry.cutoff : start;
    perCase.set(o.caseId, entry);
  }
  for (const i of internals) {
    const entry = perCase.get(i.caseId) ?? { terms: [], outcomeNumbers: [], cutoff: null };
    const terms = LeakTerms.safeParse(i.leakTerms);
    if (terms.success) entry.terms.push(...terms.data);
    if (i.dataCutoff) {
      const c = fromDbDate(i.dataCutoff);
      entry.cutoff = entry.cutoff && entry.cutoff < c ? entry.cutoff : c;
    }
    perCase.set(i.caseId, entry);
  }
  cache = { at: Date.now(), companies, tickers, perCase };
  return cache;
}

export function invalidateLeakDictionary(): void {
  cache = null;
}

/**
 * 한 카드의 질문자 응답을 거를 사전: 전 카드의 회사명·티커(이름이 나오면 누수) + 이 카드의 제품명 등 낱말·결과 수치·기준일.
 * publicText는 판단 전 공개 자료 원문 — 거기 있는 숫자는 결과 수치와 겹쳐도 누수로 보지 않는다.
 */
export async function leakDictionaryFor(caseId: string, publicText: string, client: Db = db()): Promise<LeakDictionary> {
  const c = await loadDictCache(client);
  const mine = c.perCase.get(caseId);
  return {
    companies: [...new Set(c.companies.map((x) => x.text))],
    tickers: [...new Set(c.tickers.map((x) => x.text))],
    terms: [...new Set(mine?.terms ?? [])],
    outcomeNumbers: [...new Set(mine?.outcomeNumbers ?? [])],
    publicNumbers: numericTokens(publicText).map((n) => Math.abs(n)),
    cutoff: mine?.cutoff ?? null,
  };
}
