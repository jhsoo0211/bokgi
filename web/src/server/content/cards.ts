import "server-only";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  ConceptBranch,
  EvidenceOption,
  FlowPanel,
  Index14,
  NumbersPanel,
  PublicCase,
  RiskOption,
  ThenPanel,
} from "@/shared/contract";

/**
 * 카드 원본 JSON(content/cards/*.json, 패키지 C의 content/schema/card.schema.json)과
 * 개념 JSON(content/concepts.json, content/schema/concepts.schema.json)을 읽어 세 등급으로 나눈다.
 *  ① public  → cases · case_blocks       (계약 PublicCase로 .strict() 검증)
 *  ② reveal  → case_outcomes · case_reveal · case_learning_points
 *  ③ internal→ case_internal
 * 나눌 때 ①에 ②③ 값(회사명·티커·누수 낱말·판단일 등 절대 날짜)이 섞였는지 한 번 더 본다(check_case.py의 축소판).
 */

const IsoDate = z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
const CardStatus = z.enum(["draft", "reviewed", "live", "retired"]);

const PublicSection = z
  .object({
    yearPublic: z.number().int(),
    sectorPublic: z.string().min(1),
    sizeBucket: z.enum(["소형", "중형", "대형"]),
    horizonDays: z.union([z.literal(90), z.literal(180), z.literal(365)]),
    difficulty: z.number().int().min(1).max(5),
    panels: z.object({ flow: FlowPanel, numbers: NumbersPanel, then: ThenPanel }).strict(),
    evidenceOptions: z.array(EvidenceOption).min(3).max(8),
    riskOptions: z.array(RiskOption).min(2).max(6),
  })
  .strict();

const OutcomeSection = z
  .object({
    companyName: z.string().min(1),
    ticker: z.string().min(1),
    period: z.string().min(1),
    startDate: IsoDate,
    endDate: IsoDate,
    returnPct: z.number(),
    benchReturnPct: z.number(),
    benchName: z.string().min(1),
    pricePath: Index14,
    benchPath: Index14,
    sources: z.array(z.object({ kind: z.string().min(1), label: z.string().min(1), url: z.string().nullable() }).strict()).min(1),
    // 선택(05 §3의 열): 있으면 저장
    startPrice: z.number().optional(),
    endPrice: z.number().optional(),
    sectorReturnPct: z.number().optional(),
  })
  .strict();

const RevealSection = z
  .object({
    outcome: OutcomeSection,
    keyPoints: z.array(z.string().min(1)).min(1).max(3),
    learningPoints: z
      .array(z.object({ conceptId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), rank: z.number().int().min(1).max(2), linkSentence: z.string().min(1) }).strict())
      .min(1)
      .max(2),
  })
  .strict();

const InternalSection = z
  .object({
    notes: z.string().min(1),
    leakTerms: z.array(z.string().min(1)).min(1),
    dataCutoff: IsoDate,
    example: z.boolean(),
  })
  .strict();

export const CardFile = z
  .object({
    id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
    version: z.number().int().min(1),
    status: CardStatus,
    deckOrder: z.number().int(),
    public: PublicSection,
    reveal: RevealSection,
    internal: InternalSection,
  })
  .strict();
export type CardFileT = z.infer<typeof CardFile>;

const QuizIn = z
  .object({
    quizId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(4),
    answerIndex: z.number().int().min(0).max(3),
    explanation: z.string().min(1),
  })
  .strict()
  .refine((q) => q.answerIndex < q.options.length, { message: "answerIndex out of range" });

const ConceptIn = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    branch: ConceptBranch,
    title: z.string().min(1),
    body: z.string().min(1),
    quizzes: z.array(QuizIn).min(1).max(3),
  })
  .strict();

export const ConceptsFile = z
  .object({
    version: z.number().int().min(1),
    branches: z.array(z.object({ id: ConceptBranch, title: z.string().min(1) }).strict()),
    concepts: z.array(ConceptIn).min(1),
  })
  .strict();
export type ConceptsFileT = z.infer<typeof ConceptsFile>;

export interface Content {
  dir: string;
  concepts: ConceptsFileT["concepts"];
  cards: { file: string; card: CardFileT }[];
}

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentError";
  }
}

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new ContentError(`${file}: JSON을 읽을 수 없어요 (${e instanceof Error ? e.message : String(e)})`);
  }
}

function issues(e: z.ZodError): string {
  return e.issues
    .slice(0, 8)
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

/** dir/concepts.json + dir/cards/*.json 읽기·검증. 개념 파일이 없으면(카드만 있는 폴더) concepts는 빈 배열. */
export function loadContent(dir: string): Content {
  const abs = path.resolve(dir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new ContentError(`콘텐츠 폴더가 없어요: ${abs}`);
  const conceptsPath = path.join(abs, "concepts.json");
  let concepts: ConceptsFileT["concepts"] = [];
  if (existsSync(conceptsPath)) {
    const parsed = ConceptsFile.safeParse(readJsonFile(conceptsPath));
    if (!parsed.success) throw new ContentError(`${conceptsPath}: 형식 오류\n${issues(parsed.error)}`);
    concepts = parsed.data.concepts;
  }
  const cardsDir = path.join(abs, "cards");
  const files = existsSync(cardsDir) ? readdirSync(cardsDir).filter((f) => f.endsWith(".json")).sort() : [];
  const cards = files.map((f) => {
    const file = path.join(cardsDir, f);
    const parsed = CardFile.safeParse(readJsonFile(file));
    if (!parsed.success) throw new ContentError(`${file}: 형식 오류\n${issues(parsed.error)}`);
    return { file, card: parsed.data };
  });
  return { dir: abs, concepts, cards };
}

// ---------- 세 등급으로 나누기 ----------

export interface SplitCard {
  public: {
    case: {
      id: string;
      version: number;
      yearPublic: number;
      sectorPublic: string;
      sizeBucket: string;
      horizonDays: number;
      difficulty: number;
      status: z.infer<typeof CardStatus>;
      deckOrder: number;
      evidenceOptions: z.infer<typeof EvidenceOption>[];
      riskOptions: z.infer<typeof RiskOption>[];
    };
    blocks: { kind: "flow" | "numbers" | "then"; payload: Record<string, unknown> }[];
  };
  reveal: {
    outcome: CardFileT["reveal"]["outcome"];
    keyPoints: string[];
    learningPoints: CardFileT["reveal"]["learningPoints"];
  };
  internal: { notes: string; leakTerms: string[]; dataCutoff: string };
  warnings: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ①에 섞이면 안 되는 값을 찾는다. 오류(errors)는 시드를 멈추고, 경고(warnings)는 알리기만 한다. */
export function findPublicLeaks(card: CardFileT): { errors: string[]; warnings: string[] } {
  const text = JSON.stringify(card.public);
  const errors: string[] = [];
  const warnings: string[] = [];
  const o = card.reveal.outcome;
  const names = new Set([o.companyName, ...card.internal.leakTerms.filter((t) => t !== o.ticker)]);
  for (const n of names) {
    const t = n.trim();
    if (!t) continue;
    const tickerLike = /^[A-Z][A-Z0-9.\-]{0,5}$/.test(t);
    const re = tickerLike
      ? new RegExp(`(?<![A-Za-z0-9&])${escapeRe(t)}(?![A-Za-z0-9&])`)
      : /^[\x00-\x7F]+$/.test(t)
        ? new RegExp(`(?<![A-Za-z0-9])${t.split(/\s+/).map(escapeRe).join("\\s+")}(?![A-Za-z0-9])`, "i")
        : new RegExp(t.replace(/\s+/g, "").split("").map(escapeRe).join("\\s*"));
    if (re.test(text)) errors.push(`판단 전 구획에 누수 낱말 '${t}'이 있어요`);
  }
  if (new RegExp(`(?<![A-Za-z0-9&])${escapeRe(o.ticker)}(?![A-Za-z0-9&])`).test(text)) errors.push("판단 전 구획에 티커가 있어요");
  if (/(?<!\d)(19|20)\d{2}\s*[-./]\s*(0?[1-9]|1[0-2])\s*[-./]\s*\d{1,2}(?!\d)/.test(text)) errors.push("판단 전 구획에 절대 날짜가 있어요");
  for (const d of [o.startDate, o.endDate, card.internal.dataCutoff]) if (text.includes(d)) errors.push(`판단 전 구획에 날짜 ${d}가 있어요`);
  for (const v of [o.returnPct, o.benchReturnPct]) {
    const s = String(Math.abs(v));
    if (s.includes(".") && new RegExp(`(?<![\\d.])${escapeRe(s)}(?![\\d])`).test(text)) warnings.push(`판단 전 구획에 결과 수치와 같은 숫자(${s})가 있어요 — 우연인지 확인`);
  }
  return { errors: [...new Set(errors)], warnings };
}

export function splitCard(card: CardFileT): SplitCard {
  // ① public: 계약 PublicCase(.strict())를 통과해야 한다
  const pub = PublicCase.strict().parse({ id: card.id, version: card.version, ...card.public });
  const leaks = findPublicLeaks(card);
  if (leaks.errors.length) throw new ContentError(`${card.id}: ${leaks.errors.join(", ")}`);
  return {
    public: {
      case: {
        id: pub.id,
        version: pub.version,
        yearPublic: pub.yearPublic,
        sectorPublic: pub.sectorPublic,
        sizeBucket: pub.sizeBucket,
        horizonDays: pub.horizonDays,
        difficulty: pub.difficulty,
        status: card.status,
        deckOrder: card.deckOrder,
        evidenceOptions: pub.evidenceOptions,
        riskOptions: pub.riskOptions,
      },
      blocks: [
        { kind: "flow", payload: pub.panels.flow },
        { kind: "numbers", payload: pub.panels.numbers },
        { kind: "then", payload: pub.panels.then },
      ],
    },
    reveal: { outcome: card.reveal.outcome, keyPoints: card.reveal.keyPoints, learningPoints: card.reveal.learningPoints },
    internal: { notes: card.internal.notes, leakTerms: card.internal.leakTerms, dataCutoff: card.internal.dataCutoff },
    warnings: leaks.warnings,
  };
}

/** 내용 전체 점검: 카드 id·live 덱 순서 유일, 학습 포인트 개념 존재·문제 존재, rank 1 존재. */
export function validateContent(content: Content, knownConceptIds: ReadonlySet<string> = new Set()): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const liveOrders = new Map<number, string>();
  const conceptIds = new Set([...knownConceptIds, ...content.concepts.map((c) => c.id)]);
  const quizIds = new Set<string>();
  for (const c of content.concepts) for (const q of c.quizzes) {
    if (quizIds.has(q.quizId)) errors.push(`문제 id가 겹쳐요: ${q.quizId}`);
    quizIds.add(q.quizId);
  }
  for (const { file, card } of content.cards) {
    if (ids.has(card.id)) errors.push(`${file}: 카드 id가 겹쳐요`);
    ids.add(card.id);
    if (card.status === "live") {
      const other = liveOrders.get(card.deckOrder);
      if (other) errors.push(`${file}: live 덱 순서 ${card.deckOrder}가 ${other}와 겹쳐요`);
      liveOrders.set(card.deckOrder, file);
    }
    const ranks = card.reveal.learningPoints.map((l) => l.rank);
    if (!ranks.includes(1)) errors.push(`${file}: rank 1 학습 포인트가 없어요`);
    if (new Set(ranks).size !== ranks.length) errors.push(`${file}: 학습 포인트 rank가 겹쳐요`);
    for (const lp of card.reveal.learningPoints) if (!conceptIds.has(lp.conceptId)) errors.push(`${file}: 개념 '${lp.conceptId}'이 개념 파일에 없어요`);
    if (card.public.yearPublic !== Number(card.reveal.outcome.startDate.slice(0, 4))) errors.push(`${file}: yearPublic이 판단일 연도와 달라요`);
    if (card.internal.dataCutoff > card.reveal.outcome.startDate) errors.push(`${file}: dataCutoff가 판단일보다 늦어요`);
  }
  return errors;
}
