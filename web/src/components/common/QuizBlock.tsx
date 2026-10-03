"use client";

/**
 * 확인 문제(공개·복습·개념 화면 공용). 채점은 서버(/api/concepts/{id}/quiz)가 하고 정답은 응답 뒤에만 안다.
 * 고른 보기에 맞음(빨간 펜 테두리)·틀림(취소선), 틀렸으면 정답 보기도 표시, 다음 복습일 안내.
 * 답한 뒤 보기는 aria-disabled로 막는다 — disabled로 막으면 초점이 body로 빠진다.
 */
import { useRef, useState } from "react";
import { api, errorText } from "@/lib/client/api";
import { dueLabel, localDayKey, uuid } from "@/lib/client/format";
import { markConceptSeen, markReviewDone } from "@/lib/client/session";
import type { QuizPublic, QuizResultX } from "@/lib/client/types";

type Props = {
  conceptId: string;
  quiz: QuizPublic;
  via: "reveal" | "review" | "concepts";
  onAnswered?: (r: QuizResultX) => void;
};

export function QuizBlock({ conceptId, quiz, via, onAnswered }: Props) {
  const [answer, setAnswer] = useState<{ chosen: number; result: QuizResultX } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const attemptId = useRef<string | null>(null);

  const choose = async (i: number) => {
    if (busy || answer) return;
    setBusy(true);
    setErr(null);
    attemptId.current ??= uuid();   // 같은 시도를 다시 보내도 서버가 한 번만 센다(client_attempt_id 멱등)
    try {
      const r = await api.quiz(conceptId, { quizId: quiz.quizId, optionIndex: i, clientAttemptId: attemptId.current, via });
      const date = localDayKey();
      markConceptSeen(date, conceptId);
      if (via === "review") markReviewDone(date);
      setAnswer({ chosen: i, result: r });
      onAnswered?.(r);
    } catch (e) {
      setErr(`${errorText(e)} 다시 눌러 주세요.`);
    } finally {
      setBusy(false);
    }
  };

  const r = answer?.result;
  // 서버 explanation은 '맞아요.' 또는 '아니에요. 정답: ‘…’.'로 시작한다(채점 뒤에만 정답을 안다)
  const correctIndex = !r || !answer ? -1 : r.correct ? answer.chosen
    : r.answerIndex ?? quiz.options.findIndex((o) => r.explanation.includes(`‘${o}’`));
  const verdict = r ? (r.explanation.trim() || (r.correct ? "맞아요." : correctIndex >= 0 ? `아니에요. 정답: ‘${quiz.options[correctIndex]}’.` : "아니에요.")) : "";
  const fb = r ? `${verdict} 다음 복습: ${dueLabel(r.nextDueOn, localDayKey())}` : err ?? "";

  return (
    <div className="quiz">
      <p className="quiz-q">확인 문제 · {quiz.question}</p>
      {quiz.options.map((t, i) => {
        const mark = !answer || !r ? "" : i === answer.chosen ? (r.correct ? " ok" : " no") : !r.correct && i === correctIndex ? " ok" : "";
        return (
          <button key={i} type="button" className={`opt${mark}`} data-i={i} aria-disabled={answer || busy ? true : undefined} onClick={() => choose(i)}>
            {t}
          </button>
        );
      })}
      <p className="quiz-fb" aria-live="polite">{fb}</p>
    </div>
  );
}
