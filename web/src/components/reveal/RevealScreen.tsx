"use client";

/**
 * 공개 화면 — 결과 자료(회사·티커·기간·수익률·경로), 결과색(ds-up/ds-down)과 형광펜(ds-hl)은 이 폴더에서만 쓴다.
 * 순서(docs/06 §7): 회사·기간 → 수치 3칸(부호 + ▲▼■) → 시장 대비 한 줄 + 도장 → 경로 → 내 판단 표
 * → 사후에 중요했던 것(형광펜) → ○△✕(난이도 2부터) → 해설 세 줄 → 개념 + 확인 문제 → 신고 → 다음.
 * 비슷함(±1%p)은 적중·실패로 세지 않는다. 색만으로 읽히지 않게 부호와 모양을 함께 붙인다.
 */
import { useEffect, useRef, useState } from "react";
import { QuizBlock } from "@/components/common/QuizBlock";
import { Spark } from "@/components/common/Spark";
import { TodayTop } from "@/components/common/TodayTop";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { api } from "@/lib/client/api";
import { logEvent } from "@/lib/client/events";
import { DIR, fmtSigned, localDayKey, RESULT, SHAPE } from "@/lib/client/format";
import { markConceptSeen } from "@/lib/client/session";
import type { Reveal } from "@/lib/client/types";
import { ExplainBox } from "./ExplainBox";
import { ReportSheet } from "./ReportSheet";
import { SelfCheckBox } from "./SelfCheckBox";

const tone = (v: number) => (v > 0 ? "ds-up" : v < 0 ? "ds-down" : "");
const shape = (v: number) => (v > 0 ? "▲" : v < 0 ? "▼" : "■");

function Num({ label, v, unit, cls, mk }: { label: string; v: number; unit: string; cls: string; mk: string }) {
  return (
    <div>
      <small>{label}</small>
      <b className={cls}><span className="mk" aria-hidden="true">{mk}</span>{fmtSigned(v)}{unit}</b>
    </div>
  );
}

type Props = { reveal: Reveal; judged: number; nextLabel: string; onNext: () => void };

export function RevealScreen({ reveal, judged, nextLabel, onNext }: Props) {
  useScreenFocus();
  const [explain, setExplain] = useState(reveal.explain);
  const [sheet, setSheet] = useState(false);
  const [reported, setReported] = useState(false);
  const flagRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const restore = useRef<"flag" | "status" | null>(null);
  const o = reveal.outcome, r = reveal.result, j = reveal.judgment, concept = reveal.learning.concept;
  // 출처: kind "예시"는 설명용 값이라는 표시(기간 줄의 작은 꼬리표), 나머지(가격·공시·통계·보도)는 경로 아래 짧은 목록
  const sample = o.sources.find((s) => s.kind === "예시");
  const listed = o.sources.filter((s) => s.kind !== "예시");

  useEffect(() => { markConceptSeen(localDayKey(), concept.id); }, [concept.id]);   // '오늘 되짚은 개념'

  // 템플릿 해설은 공개 응답에 들어 있다. AI 해설(05 §4 /api/ai/explain)이 따로 오면 그것으로 바꾼다
  useEffect(() => {
    let alive = true;
    api.explain(reveal.judgmentId)
      .then((ex) => { if (alive && ex.source === "llm") setExplain(ex); })
      .catch(() => { /* 템플릿 해설을 그대로 둔다 */ });
    return () => { alive = false; };
  }, [reveal.judgmentId]);

  // 시트가 닫힌 뒤 초점: 연 버튼으로(보냈으면 고마움 문구로)
  useEffect(() => {
    if (sheet || !restore.current) return;
    const target = restore.current === "status" ? statusRef.current : flagRef.current;
    restore.current = null;
    target?.focus();
  }, [sheet, reported]);

  const openReport = () => {
    setSheet(true);
    logEvent("report_open", { caseId: reveal.caseId, caseVersion: reveal.version });
  };

  return (
    <>
      <h1 id="screen-title" className="sr-only">결과 공개</h1>
      <TodayTop judged={judged} label="결과" />
      <div className="reveal">
        <h2 className="name ds-head">{o.companyName} ({o.ticker})</h2>
        <span className="period ds-muted">
          {o.period}
          {sample && <>{" · "}<span className="sample-tag" title={sample.label}>예시 자료</span></>}
        </span>
      </div>
      <div className="ds-nums">
        <Num label="이 회사" v={o.returnPct} unit="%" cls={tone(o.returnPct)} mk={shape(o.returnPct)} />
        <Num label={o.benchName} v={o.benchReturnPct} unit="%" cls={tone(o.benchReturnPct)} mk={shape(o.benchReturnPct)} />
        <Num label="시장 대비" v={r.relativePp} unit="%p" cls={r.state === "even" ? "" : tone(r.relativePp)} mk={SHAPE[r.state]} />
      </div>
      <p className="verdict">
        {r.state === "even" ? (
          <><em className="ds-stamp ds-stamp--even">{RESULT.even}</em><span>거의 같았어요 — 적중·실패로 세지 않아요</span></>
        ) : (
          <>
            <em className={`ds-stamp${r.hit ? " ds-stamp--ok" : ""}`}>{RESULT[r.state]}</em>
            <span>시장보다 {Math.abs(r.relativePp).toFixed(1)}%p {r.state === "ahead" ? "앞섰어요" : "뒤졌어요"} · {r.hit ? "판단한 방향과 같아요" : "판단한 방향과 달라요"}</span>
          </>
        )}
      </p>
      <div id="path"><Spark series={[{ pts: o.pricePath, cls: "ln-main" }, { pts: o.benchPath, cls: "ln-bench" }]} /></div>
      <div className="legend"><span><i className="ln-main" />이 회사</span><span><i className="ln-bench" />{o.benchName}</span></div>
      {listed.length > 0 && (
        <ul className="sources" aria-label="출처">
          {listed.map((s, i) => (
            <li key={i}>
              <span className="src-kind">{s.kind}</span>
              {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a> : s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="ds-card mine">
        <h2 className="ds-card-title">내 판단</h2>
        <div className="row"><span>방향</span><b>{DIR[j.direction]}</b></div>
        <div className="row"><span>확신도</span><b className="ds-num">{j.confidence} / 5</b></div>
        <div className="row"><span>근거</span><b>{j.keyEvidence}</b></div>
        <div className="row"><span>위험 요인</span><b>{j.risk || "—"}</b></div>
        {j.recognized && <div className="row"><span>아는 회사</span><b>알고 판단</b></div>}
        <div className="after" id="after-row">
          <div className="row"><span>사후에 중요했던 것</span><b><span className="ds-hl">{concept.title}</span></b></div>
          {reveal.keyPoints.length > 0 && (
            <ul className="kp-list" aria-label="사후에 중요했던 것">
              {reveal.keyPoints.map((k, i) => <li key={i}>{k}</li>)}
            </ul>
          )}
        </div>
        {reveal.learning.selfCheckEnabled && <SelfCheckBox judgmentId={reveal.judgmentId} initial={j.selfCheck} />}
      </div>
      <ExplainBox explain={explain} conceptTitle={concept.title} />
      <div className="ds-card concept">
        <h2 className="ds-card-title">다시 볼 개념 · <span className="ds-hl">{concept.title}</span></h2>
        {concept.linkSentence && <p className="concept-link">{concept.linkSentence}</p>}
        <p>{concept.body}</p>
        <QuizBlock conceptId={concept.id} quiz={reveal.learning.quiz} via="reveal" />
      </div>
      <div className="report-line">
        {reported ? (
          <p className="ds-muted small" role="status" tabIndex={-1} ref={statusRef}>신고를 남겼어요. 고마워요 — 카드를 고칠 때 확인할게요.</p>
        ) : (
          <button type="button" className="ds-btn ghost" id="flag" ref={flagRef} onClick={openReport}>정보가 이상해요</button>
        )}
      </div>
      <button type="button" className="ds-btn ds-btn--primary wide" id="next" onClick={onNext}>{nextLabel}</button>
      {sheet && (
        <ReportSheet
          caseId={reveal.caseId}
          caseVersion={reveal.version}
          onClose={() => { restore.current = "flag"; setSheet(false); }}
          onSent={() => { restore.current = "status"; setReported(true); setSheet(false); }}
        />
      )}
    </>
  );
}
