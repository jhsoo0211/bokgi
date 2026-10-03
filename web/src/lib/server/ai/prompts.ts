import "server-only";
import { z } from "zod";
import type { ChatMessage } from "./client";
import { QUESTION_TYPE_NAMES, type QuestionType } from "./templates";

/**
 * LLM 프롬프트. 넣는 것은 서버가 가진 자료뿐이다 — 사용자 자유 텍스트·닉네임·신고 메모는 넣지 않는다(05 §5).
 * 질문자: toPublicCase() 결과(상대 날짜)와 칩 글자·확신도. 회사명·절대 날짜·결과는 없다.
 * 해설자: 공개된 결과 + 사용자 판단(칩 글자) + 학습 포인트 개념.
 * 어조는 시스템 프롬프트에만 있다(가드 뒤에 문장을 바꾸는 단계는 없다).
 */

export interface QuestionerContext {
  publicCase: unknown; // PublicCase(판단 전 자료)
  evidenceLabel: string;
  evidencePanel: string;
  confidence: number;
  type: QuestionType;
}

export function questionerMessages(ctx: QuestionerContext): ChatMessage[] {
  const system = [
    "너는 투자 학습 앱 '복기'의 질문자다. 사용자는 과거 사례 카드를 보고 '판단 기간 뒤 이 회사가 시장보다 앞섰을지 뒤졌을지'를 판단하는 중이다.",
    "규칙:",
    "- 결과·정답·회사 이름·티커·제품 이름·실제 날짜를 말하지 않는다. 판단일 이후에 일어난 일은 모른다고 가정한다.",
    "- 카드 자료에 있는 숫자만 쓴다. 새 숫자를 만들지 않는다.",
    "- 매수·매도를 권하지 않는다. 판단을 대신 내리지 않는다.",
    `- 질문 유형은 '${QUESTION_TYPE_NAMES[ctx.type]}' 하나다. 그 틀로 되묻는 질문 한두 문장만 쓴다.`,
    "- 중립적이고 짧은 존댓말(해요체). 머리말·목록·따옴표 설명 없이 질문 문장만.",
  ].join("\n");
  const user = JSON.stringify({
    card: ctx.publicCase,
    userPick: { evidence: ctx.evidenceLabel, panel: ctx.evidencePanel, confidence: ctx.confidence },
  });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export interface ExplainerContext {
  outcome: { companyName: string; period: string; returnPct: number; benchReturnPct: number; benchName: string; relativePp: number; state: string };
  judgment: { direction: string; evidence: string; risk: string | null; confidence: number };
  concept: { title: string; body: string };
  keyPoints: string[];
}

export function explainerMessages(ctx: ExplainerContext): ChatMessage[] {
  const system = [
    "너는 투자 학습 앱 '복기'의 해설자다. 사용자의 판단과 공개된 결과를 나란히 놓고 개념 하나를 연결한다.",
    "규칙:",
    "- 결과를 한 가지 원인으로 단정하지 않는다('~ 때문에 올랐습니다' 금지). 추론은 추론으로 말한다.",
    "- 주어진 자료의 숫자만 쓴다. 새 숫자를 만들지 않는다.",
    "- 매수·매도를 권하지 않는다. '원래 사야 했다' 같은 말을 하지 않는다. 한 번의 결과로 실력을 평가하지 않는다.",
    '- 출력은 JSON 하나: {"good":"이번에 잘 읽은 것 한 문장","change":"다음에 바꿀 것 한 문장","concept":"개념 연결 한 문장"}',
    "- 각 문장은 중립적인 해요체 한 문장.",
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(ctx) },
  ];
}

export const ExplainerOutput = z.object({ good: z.string().min(1), change: z.string().min(1), concept: z.string().min(1) }).strict();

/** LLM 응답에서 JSON 한 덩어리를 꺼낸다(코드 블록 감싸기 허용). 실패하면 null. */
export function parseExplainerOutput(text: string): z.infer<typeof ExplainerOutput> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = ExplainerOutput.safeParse(JSON.parse(m[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 질문자 응답 → 최대 두 문장 */
export function parseQuestionerOutput(text: string): string[] {
  const cleaned = text.replace(/^["'“”\s]+|["'“”\s]+$/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  return [cleaned.slice(0, 300)];
}
