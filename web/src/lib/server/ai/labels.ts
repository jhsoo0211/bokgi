import "server-only";
import type { z } from "zod";
import type { ExplainLine, LabelKind, QuestionLine } from "@/shared/contract";

/**
 * 라벨: 베타는 문장 단위 분류 대신 출력 칸 고정 라벨(05 §11).
 * 해설: 잘 읽은 것 📄 출처 · 바꿀 것 🔍 추론 · 개념 📄 출처. 질문: 🔍 추론(되묻는 말이라 사실 주장이 아니다).
 * 가드 체인의 마지막 단계다 — 라벨 뒤에 문장을 바꾸는 단계는 없다.
 */
type Label = z.infer<typeof LabelKind>;
type ExplainKind = z.infer<typeof ExplainLine>["kind"];

export const EXPLAIN_LABELS: Record<ExplainKind, Label> = { good: "source", change: "inference", concept: "source" };
export const QUESTION_LABEL: Label = "inference";

export function labelQuestion(texts: string[]): z.infer<typeof QuestionLine>[] {
  return texts.slice(0, 2).map((text) => ({ label: QUESTION_LABEL, text }));
}

export function labelExplain(lines: { kind: ExplainKind; text: string }[]): z.infer<typeof ExplainLine>[] {
  return lines.map((l) => ({ kind: l.kind, label: EXPLAIN_LABELS[l.kind], text: l.text }));
}
