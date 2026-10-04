"use client";

/**
 * 일지: 연습 달력(‹ 달 ›) → 판단 기록(최신순, 공개 전 행은 업종·규모와 '결과 대기') → 통계(접힘, 20장 뒤에 인사이트 카드) → 내보내기.
 * 행 둘째 줄은 근거부터(근거 · 확신 · 방향) — 일지에서도 첫 정보가 결과가 아니라 근거가 되게. 공개된 행은 셋째 줄에 그 카드의 개념
 * (conceptTitle, 공개 전에는 서버가 null). 판단 때의 정보 수준은 작은 표시(핵심만·전부·지정, 기본은 표시 없음). 기록이 없으면 내보내기는 숨기고
 * '오늘 카드 판단하러 가기' 안내 단추를 둔다(빈 상태에 다음 행동 하나).
 * 결과색·형광펜을 쓰지 않는다(상태는 낱말 + 모양). 적중률을 숫자로 보이지 않는다. ○△✕는 기록만, 합산 없음.
 * 실제 앱에는 '세션 초기화'가 없다(판단 기록은 불변).
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useApp } from "@/components/app/AppContext";
import { ErrorBox, Loading } from "@/components/common/Status";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { api, errorText, isApiError } from "@/lib/client/api";
import { buildMonth, dueCounts, monthRange, type MonthCalendar } from "@/lib/client/calendar";
import { logEvent } from "@/lib/client/events";
import { addMonths, CALIBRATION_FEW, DIR, insightKind, LEVEL_SHORT, localDayKey, md, MIN_INSIGHT, monthIndex, monthOf, RESULT, SELF_CHECK, SHAPE } from "@/lib/client/format";
import { settled } from "@/lib/client/session";
import type { ConceptListItem, Journal, JournalItem } from "@/lib/client/types";
import { Calendar } from "./Calendar";

type Ready = { kind: "ready"; journal: Journal; concepts: ConceptListItem[]; cal: MonthCalendar };
type State = { kind: "loading" } | { kind: "error"; message: string } | Ready;

/** 서버가 그 달을 주면 그대로, 아니면(?month=를 모르는 서버) 판단 날짜·복습일로 계산 */
function calendarFor(journal: Journal, concepts: ConceptListItem[], month: string, today: string): MonthCalendar {
  const c = journal.calendar;
  if (c.month === month) return { month, days: c.days, practicedDays: c.practicedDays, reviewsDue: c.reviewsDue };
  const due = dueCounts(concepts.map((x) => x.dueOn).filter((d): d is string => !!d), today);
  return buildMonth(month, new Set(journal.items.map((i) => i.localDate)), due);
}

async function loadJournal(today: string): Promise<Ready> {
  await settled();   // 탭을 옮기며 보낸 판단이 '결과 대기'로 바로 보이게
  const [journal, list] = await Promise.all([api.journal(), api.concepts()]);
  return { kind: "ready", journal, concepts: list.concepts, cal: calendarFor(journal, list.concepts, monthOf(today), today) };
}

function JournalRow({ it }: { it: JournalItem }) {
  const title = it.revealed && it.companyName ? `${it.companyName} (${it.ticker ?? ""})` : `${it.sectorPublic} · ${it.sizeBucket}`;
  const self = it.selfCheck ? SELF_CHECK[it.selfCheck] : null;
  return (
    <li className="jrow">
      <div className="jrow-head">
        <span className="jrow-date ds-num">{md(it.localDate)}</span>
        <b className="jrow-title">{title}</b>
        {it.recognized && <span className="tag">알고 판단</span>}
        {it.infoLevel !== "standard" && <span className="tag tag--lvl" data-level={it.infoLevel}><span className="sr-only">정보 수준 </span>{LEVEL_SHORT[it.infoLevel]}</span>}
        {self && <span className="jmark" role="img" aria-label={`개념 확인: ${self[1]}`} title={`개념 확인: ${self[1]}`}>{self[0]}</span>}
        {it.result
          ? <span className="jstate"><span aria-hidden="true">{SHAPE[it.result.state]}</span> {RESULT[it.result.state]}</span>
          : <span className="jstate jstate--wait">결과 대기</span>}
      </div>
      <div className="jrow-body">근거 <b>{it.keyEvidence}</b> · 확신 <b className="ds-num">{it.confidence}/5</b> · {DIR[it.direction]}</div>
      {it.revealed && it.conceptTitle && <div className="jrow-concept">개념 <b>{it.conceptTitle}</b></div>}
    </li>
  );
}

export function JournalScreen() {
  useScreenFocus();
  const { onUnauthorized, navigate } = useApp();
  const [state, setState] = useState<State>({ kind: "loading" });
  const focusAfter = useRef<"cal-prev" | "cal-next" | null>(null);
  const [calErr, setCalErr] = useState<string | null>(null);   // 달 넘기기 실패(연결 등) — 눌렀는데 아무 일 없는 것처럼 보이지 않게
  const today = localDayKey();

  const load = () => {
    loadJournal(today).then(setState, (e: unknown) => {
      if (isApiError(e, 401)) onUnauthorized();
      else setState({ kind: "error", message: errorText(e) });
    });
  };
  const onMount = useEffectEvent(() => load());
  useEffect(() => { onMount(); }, []);

  // 달을 넘긴 뒤: 누른 버튼에 초점(끝에 닿아 꺼졌으면 달 이름으로)
  useEffect(() => {
    const id = focusAfter.current;
    if (!id || state.kind !== "ready") return;
    focusAfter.current = null;
    const b = document.getElementById(id);
    (b instanceof HTMLButtonElement && !b.disabled ? b : document.getElementById("cal-title"))?.focus({ preventScroll: true });
  }, [state]);

  if (state.kind === "loading") return <Loading />;
  if (state.kind === "error") return <ErrorBox message={state.message} onRetry={() => { setState({ kind: "loading" }); load(); }} />;

  const { journal, concepts, cal } = state;
  const range = monthRange(journal.items.map((i) => i.localDate), concepts.map((c) => c.dueOn).filter((d): d is string => !!d), today);
  const curIdx = monthIndex(cal.month);
  const shift = curIdx - monthIndex(monthOf(today));
  const total = journal.items.filter((i) => i.revealed).length;
  const { locked, unlockAt, insights, calibrationNote } = journal.stats;
  const items = [...journal.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));   // 최신순

  const changeMonth = async (step: -1 | 1) => {
    const target = addMonths(cal.month, step);
    if (monthIndex(target) < monthIndex(range.min) || monthIndex(target) > monthIndex(range.max)) return;
    try {
      const j = await api.journal(target);
      focusAfter.current = step < 0 ? "cal-prev" : "cal-next";
      setCalErr(null);
      setState({ kind: "ready", journal: j, concepts, cal: calendarFor(j, concepts, target, today) });
      logEvent("calendar_month", { payload: { month: target, shift: monthIndex(target) - monthIndex(monthOf(today)) } });
    } catch (e) {
      if (isApiError(e, 401)) onUnauthorized();
      else setCalErr(`달을 넘기지 못했어요. ${errorText(e)}`);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items: journal.items, stats: journal.stats }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bokgi-journal.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <h1 id="screen-title" className="sr-only">일지</h1>
      <div className="top"><span>일지</span><span className="ds-num">판단 {journal.count}장</span></div>
      <section className="ds-card cal" id="cal" aria-label="연습 달력">
        <Calendar
          cal={cal} today={today} isCurrent={shift === 0}
          canPrev={curIdx > monthIndex(range.min)} canNext={curIdx < monthIndex(range.max)}
          onPrev={() => { void changeMonth(-1); }} onNext={() => { void changeMonth(1); }}
        />
        <p className="cal-err" role="status">{calErr}</p>
      </section>
      <h2 className="sr-only">판단 기록</h2>
      {items.length ? (
        <ul className="jlist">{items.map((it) => <JournalRow key={it.judgmentId} it={it} />)}</ul>
      ) : (
        <div className="empty">
          <p>아직 남긴 판단이 없어요. 카드 한 장을 판단하면 근거·확신도와 함께 여기에 쌓여요.</p>
          <button type="button" className="ds-btn wide" id="go-today" onClick={() => navigate("today")}>오늘 카드 판단하러 가기</button>
        </div>
      )}
      <h2 className="sr-only">통계</h2>
      <details className="stats" onToggle={(e) => logEvent("stats_toggle", { payload: { open: e.currentTarget.open, unlocked: !locked, n: total } })}>
        <summary>{locked ? `통계 (${unlockAt}장 뒤에 열려요 · 지금 ${total}장)` : `통계 (지금 ${total}장)`}</summary>
        <div className="stats-body">
          {locked ? (
            <p>판단이 {unlockAt}장 쌓이면 근거별 횟수와 확신도 보정을 글로 보여 드려요. 몇 장만으로는 운과 실력을 가를 수 없어서예요.</p>
          ) : (
            <>
              {insights.length ? (
                <div className="ins-list">
                  {insights.map((text, i) => {
                    const kind = insightKind(text);
                    return <div key={i} className="ds-insight">{kind && <span className="ds-insight-kind">{kind}</span>}<p>{text}</p></div>;
                  })}
                </div>
              ) : (
                <p>같은 조건의 판단이 {MIN_INSIGHT}번 이상 모이면 한 줄씩 묶어 보여 드려요.</p>
              )}
              <h3 className="stats-h">확신도 보정</h3>
              <p className="calib">{calibrationNote ?? CALIBRATION_FEW}</p>
              <p className="ds-muted small">몇십 장으로는 운과 실력을 가르기 어려워요. 횟수는 내 근거를 되돌아보는 실마리로만 보세요.</p>
            </>
          )}
        </div>
      </details>
      {items.length > 0 && <div className="row2"><button type="button" className="ds-btn" id="export" onClick={exportJson}>연구 로그 내보내기</button></div>}
      <p className="hint">적중률은 점수가 아니에요. 근거·확신도·개념이 먼저예요.</p>
    </>
  );
}
