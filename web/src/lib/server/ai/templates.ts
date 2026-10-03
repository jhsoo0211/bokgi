import "server-only";
import type { z } from "zod";
import type { Direction, PanelKind, ResultState } from "@/shared/contract";
import { josa, signed1 } from "../ko";
import { allowedNumbers, guardSentences, type AllowedNumber } from "./numberGuard";

/**
 * 템플릿 질문(질문자) 6유형 × 고정 문장 3개(05 §5, 기획안 §8.1)와 템플릿 해설(해설자 세 줄, 프로토타입 state.js AI.explain 이식).
 * 유형 선택은 근거 칩의 판·확신도·이 카드에서 앞서 물은 횟수로만 정한다 — 결과(앞섬·뒤짐)를 읽지 않는다(방향 중립).
 */
type Panel = z.infer<typeof PanelKind>;
type Dir = z.infer<typeof Direction>;
type State = z.infer<typeof ResultState>;

export type QuestionType = 1 | 2 | 3 | 4 | 5 | 6;
export const QUESTION_TYPE_NAMES: Record<QuestionType, string> = {
  1: "근거의 반대 증거 묻기",
  2: "다른 판에서 놓친 숫자 묻기",
  3: "시장 대비인지 절대인지 확인",
  4: "기간이 바뀌면 판단이 바뀌는지",
  5: "판단을 무효화할 조건",
  6: "확신도의 근거",
};

/** 확신도 5 → ⑥, 4 → ⑤, 1 → ②, 2·3 → 판별(숫자 ①, 흐름 ③, 그때 ④). 같은 카드에서 다시 물으면 다음 유형으로. */
export function pickQuestionType(panel: Panel, confidence: number, priorAsks = 0): QuestionType {
  let base: number;
  if (confidence >= 5) base = 6;
  else if (confidence === 4) base = 5;
  else if (confidence <= 1) base = 2;
  else base = panel === "numbers" ? 1 : panel === "flow" ? 3 : 4;
  const idx = (((base - 1 + priorAsks) % 6) + 6) % 6;
  return (idx + 1) as QuestionType;
}

/** 문장 고르기용 결정적 해시(FNV-1a) — 같은 카드·같은 칩이면 같은 문장 */
export function stableIndex(seed: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % n;
}

const PANEL_NAME: Record<Panel, string> = { flow: "흐름", numbers: "숫자", then: "그때" };
const others = (p: Panel) => {
  const [a, b] = (["flow", "numbers", "then"] as Panel[]).filter((x) => x !== p).map((x) => PANEL_NAME[x]);
  return `「${a}」${josa(a, "이나", "나")} 「${b}」`;
};

interface QCtx {
  ev: string;
  panel: Panel;
  conf: number;
}
const q = (ev: string) => `'${ev}'`;

const QUESTION_BANK: Record<QuestionType, ((c: QCtx) => string)[]> = {
  1: [
    ({ ev }) => `${q(ev)}${josa(ev, "을", "를")} 가장 중요하게 보셨군요. 카드에서 이 근거와 반대로 읽히는 정보를 하나 찾는다면 무엇일까요?`,
    ({ ev }) => `${q(ev)}${josa(ev, "이", "가")} 틀렸다고 가정해 보세요. 그때 가장 먼저 눈에 띌 반대 증거는 어느 판에 있을까요?`,
    ({ ev }) => `같은 업종의 다른 회사도 ${q(ev)}${josa(ev, "과", "와")} 비슷하다면, 이 회사만의 이유는 무엇일까요?`,
  ],
  2: [
    ({ ev, panel }) => `${q(ev)}${josa(ev, "은", "는")} 「${PANEL_NAME[panel]}」 판에서 고른 근거예요. ${others(panel)} 판에 이 판단을 흔들 정보가 있었는지 한 번 더 볼까요?`,
    ({ panel }) => `${others(panel)} 판에는 아직 근거로 쓰지 않은 정보가 있어요. 그중 이 판단과 가장 어긋나는 것은 무엇일까요?`,
    ({ ev }) => `${q(ev)} 말고 다른 판에서 하나만 더 고른다면 무엇을 고르시겠어요?`,
  ],
  3: [
    ({ ev }) => `이 카드는 시장보다 앞설지 뒤질지를 묻고 있어요. ${q(ev)}${josa(ev, "은", "는")} 시장 전체에도 해당하는 이야기일까요, 이 회사만의 이야기일까요?`,
    ({ ev }) => `주가가 올라도 시장이 더 오르면 뒤진 거예요. ${q(ev)}${josa(ev, "이", "가")} 시장 대비로도 유리하다고 볼 근거는 무엇일까요?`,
    () => `「흐름」 판에서 이 회사 지수와 시장 지수를 나란히 보면, 둘의 차이는 어디서 생겼을까요?`,
  ],
  4: [
    ({ ev }) => `판단 기간이 절반으로 줄어도 ${q(ev)}${josa(ev, "이", "가")} 주는 신호는 그대로일까요?`,
    () => `판단 기간이 두 배로 늘면 이 판단이 바뀔까요? 바뀐다면 어떤 정보 때문일까요?`,
    ({ ev }) => `${q(ev)}${josa(ev, "은", "는")} 짧은 기간에 드러나는 정보일까요, 긴 기간에 걸쳐 드러나는 정보일까요?`,
  ],
  5: [
    () => `어떤 정보가 나오면 이 판단을 거두시겠어요? 카드 안에서 그 조건에 가장 가까운 것을 찾아보세요.`,
    ({ ev }) => `${q(ev)}${josa(ev, "이", "가")} 무너지는 조건을 한 문장으로 적는다면 어떻게 될까요?`,
    () => `이 판단이 틀렸다는 첫 신호는 어느 판에서 먼저 보일까요?`,
  ],
  6: [
    ({ ev, conf }) => `확신도 ${conf}${josa(conf, "을", "를")} 고르셨어요. 그만큼 확신하게 만든 정보가 ${q(ev)} 하나뿐인가요?`,
    ({ conf }) => `고른 확신도 ${conf}, 그 숫자를 만든 정보를 하나만 꼽는다면 무엇일까요?`,
    ({ ev }) => `${q(ev)}${josa(ev, "이", "가")} 없었다면 확신도를 얼마로 골랐을까요?`,
  ],
};

/** 누수 필터에 걸렸을 때 쓰는 안전 문장(기획안 §10.1) */
export const SAFE_QUESTION = "근거를 하나 더 말해줄래요?";

export function templateQuestion(type: QuestionType, ctx: QCtx, seed: string): string {
  const bank = QUESTION_BANK[type];
  return bank[stableIndex(seed, bank.length)](ctx);
}

// ---------- 템플릿 해설 ----------

export const EXPLAIN_PERSONA = "펀드매니저";

export interface ExplainInput {
  evidence: string;
  risk: string | null;
  direction: Dir;
  state: State;
  hit: boolean | null;
  returnPct: number;
  benchReturnPct: number;
  relativePp: number;
  benchName: string;
  conceptTitle: string;
}

export const SAFE_EXPLAIN = {
  good: "이번에 고른 근거와 결과는 위 내 판단 표에서 나란히 볼 수 있어요.",
  change: "왜 이렇게 움직였는지는 한 가지 이유로 말할 수 없으니, 다음에는 근거가 이미 가격에 반영돼 있었는지부터 확인해 보세요.",
  concept: "이번 결과를 읽는 데 필요한 개념은 아래 개념 카드에 있어요.",
} as const;

/** 해설 허용 숫자: 공개 화면에 나온 숫자(기업·시장 수익률, 시장 대비, 시장 이름)와 고른 근거 칩의 숫자 */
export function explainAllowed(i: ExplainInput): AllowedNumber[] {
  return allowedNumbers(signed1(i.returnPct), signed1(i.benchReturnPct), signed1(i.relativePp), i.benchName, i.evidence, i.risk);
}

/** 세 줄 틀(각 한 문장): good 잘 읽은 것 · change 다음에 바꿀 것 · concept 개념 연결(늘 마지막) */
export function templateExplainLines(i: ExplainInput): { kind: "good" | "change" | "concept"; text: string }[] {
  const ev = i.evidence;
  const qe = `'${ev}'`;
  const rel = signed1(i.relativePp);
  const dir = i.direction === "outperform" ? "시장보다 앞섰다" : "시장보다 뒤졌다";
  const picked = `${qe}${josa(ev, "을", "를")} 핵심 근거로 짚어`;
  const good =
    i.state === "even"
      ? `${picked} 두었고, 결과는 시장 대비 ${rel}%p로 시장과 거의 같았어요.`
      : i.hit
        ? `${picked} '${dir}'를 골랐고, 결과도 시장 대비 ${rel}%p로 고른 방향과 같았어요.`
        : `${picked} 두었기에, 시장 대비 ${rel}%p라는 결과와 나란히 되짚어 볼 수 있어요.`;
  const change = !i.risk
    ? `다음에는 ${qe}${josa(ev, "과", "와")} 함께 가장 큰 위험 요인도 하나 골라, 반대로 움직일 가능성을 같이 적어 보세요.`
    : i.state === "even"
      ? "시장과 거의 같게 움직인 사례라 근거의 힘을 가리기 어려우니, 다음에는 같은 근거가 시장 대비로 어떻게 이어지는지 여러 장에 걸쳐 살펴보세요."
      : i.hit
        ? `방향이 같았던 한 번만으로 근거가 옳았다고 보기는 어려우니, 다음에도 ${qe}${josa(ev, "이", "가")} 이미 가격에 반영돼 있었는지부터 확인해 보세요.`
        : `왜 이렇게 움직였는지는 한 가지 이유로 말할 수 없지만, 다음에 ${qe} 같은 근거를 쓸 때는 그 정보가 이미 가격에 반영돼 있었는지부터 확인해 보세요.`;
  const concept = `이번 결과를 읽는 데 필요한 개념은 ${i.conceptTitle}${josa(i.conceptTitle, "이에요", "예요")}.`;

  const allowed = explainAllowed(i);
  const literals = [i.conceptTitle];
  // 숫자 가드(줄 단위): 어긴 줄은 숫자 없는 문장으로 바꾼다
  const guardLine = (text: string, safe: string) => {
    const g = guardSentences(text, allowed, safe, literals);
    return g.replaced > 0 ? safe : g.text;
  };
  return [
    { kind: "good", text: guardLine(good, SAFE_EXPLAIN.good) },
    { kind: "change", text: guardLine(change, SAFE_EXPLAIN.change) },
    { kind: "concept", text: guardLine(concept, SAFE_EXPLAIN.concept) },
  ];
}
