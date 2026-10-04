"use client";

/**
 * 개념 탭: 머리줄 오른쪽의 '길 / 목록' 전환(기본 길, 기기마다 기억 — concept_path_view). 형광펜·결과색은 쓰지 않는다(공개 화면 전용).
 * - 길(D17, 02 §7.2 · CONTEXT '개념 길'): 네 갈래(결과 읽기·숫자 읽기·그때 읽기·내 판단 읽기)를 세로 길로 놓고, 갈래 안 순서(order)대로
 *   개념을 노드로 그린다. 숙련도는 네 모양 + 글자(신규 = 빈 원, 학습 중 = 반 채운 원, 복습 필요 = 마름모, 이해 = 채운 원 + ✓) — 색만으로 읽지 않는다.
 *   다음 복습 노드(복습일이 가장 이른 개념 — 오늘 복습 순서와 같은 규칙)는 빨간 펜 고리 + '다음 복습' 글자. 잠금·점수·XP는 없다:
 *   순서는 안내일 뿐이고 어느 노드든 눌러 설명과 확인 문제를 연다(개념은 카드에서 만난다).
 * - 목록: 갈래 머리 아래 개념 줄, 숙련도 뱃지(테두리만), 복습 예정일.
 * 누르면 설명과 확인 문제(풀면 복습 일정이 정해진다). 상세에서 돌아오면 연 노드·줄로 초점·스크롤을 돌려준다(맨 위로 튀지 않게).
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useApp } from "@/components/app/AppContext";
import { QuizBlock } from "@/components/common/QuizBlock";
import { ErrorBox, Loading } from "@/components/common/Status";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { api, errorText, isApiError } from "@/lib/client/api";
import { logEvent } from "@/lib/client/events";
import { BRANCHES, BRANCH_LABEL, CONCEPT_STATE, dueLabel, localDayKey } from "@/lib/client/format";
import { storeConceptView, storedConceptView, type ConceptView } from "@/lib/client/session";
import type { ConceptListItem, ConceptState } from "@/lib/client/types";

const STATES: readonly ConceptState[] = ["new", "learning", "review", "known"];

export function ConceptsScreen() {
  const [open, setOpen] = useState<ConceptListItem | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [mode, setMode] = useState<ConceptView>(storedConceptView);
  const changeMode = (m: ConceptView) => {
    if (m === mode) return;
    setMode(m);
    storeConceptView(m);
    logEvent("concept_path_view", { payload: { view: m } });
  };
  return open
    ? <ConceptDetail key={open.id} item={open} onBack={() => { setReturnTo(open.id); setOpen(null); }} />
    : <ConceptHome mode={mode} onMode={changeMode} onOpen={setOpen} returnTo={returnTo} />;
}

/** 다음 복습: 복습일이 가장 이른 개념(같으면 id 순 — 서버의 오늘 복습 순서와 같다) */
function nextDueId(list: readonly ConceptListItem[]): string | null {
  const due = list.filter((c): c is ConceptListItem & { dueOn: string } => c.dueOn !== null);
  due.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
  return due[0]?.id ?? null;
}

type HomeProps = { mode: ConceptView; onMode: (m: ConceptView) => void; onOpen: (c: ConceptListItem) => void; returnTo: string | null };

function ConceptHome({ mode, onMode, onOpen, returnTo }: HomeProps) {
  useScreenFocus();
  const { onUnauthorized } = useApp();
  const [list, setList] = useState<ConceptListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const restored = useRef(false);
  const today = localDayKey();

  useEffect(() => {
    if (!list || !returnTo || restored.current) return;
    restored.current = true;
    const row = [...document.querySelectorAll<HTMLElement>("#view [data-c]")].find((e) => e.dataset.c === returnTo);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "center" });
  }, [list, returnTo]);

  const load = () => {
    api.concepts().then((l) => setList(l.concepts), (e: unknown) => {
      if (isApiError(e, 401)) onUnauthorized();
      else setErr(errorText(e));
    });
  };
  const onMount = useEffectEvent(() => load());
  useEffect(() => { onMount(); }, []);

  if (err) return <ErrorBox message={err} onRetry={() => { setErr(null); load(); }} />;
  if (!list) return <Loading />;
  return (
    <>
      <h1 id="screen-title" className="sr-only">개념</h1>
      <div className="top">
        <span>개념 <b className="ds-num">{list.length}개</b></span>
        <span className="view-toggle" role="group" aria-label="개념 보기">
          <button type="button" id="cv-path" aria-pressed={mode === "path"} onClick={() => onMode("path")}>길</button>
          <button type="button" id="cv-list" aria-pressed={mode === "list"} onClick={() => onMode("list")}>목록</button>
        </span>
      </div>
      {mode === "path" ? <PathView list={list} today={today} onOpen={onOpen} /> : <ListView list={list} today={today} onOpen={onOpen} />}
      <p className="hint">확인 문제를 풀면 복습 날짜가 정해져요 (1·3·7·21일).</p>
    </>
  );
}

type ViewProps = { list: ConceptListItem[]; today: string; onOpen: (c: ConceptListItem) => void };

function PathView({ list, today, onOpen }: ViewProps) {
  const next = nextDueId(list);
  return (
    <div className="cpath-wrap" id="cpath">
      <p className="cpath-intro">순서는 안내일 뿐이에요. 잠금 없이 어느 개념이든 열어 볼 수 있고, 개념은 카드에서 만나요.</p>
      <p className="cpath-key" aria-hidden="true">
        {STATES.map((s) => <span key={s}><i className={`cmk cmk--${s}`} />{CONCEPT_STATE[s]}</span>)}
      </p>
      {BRANCHES.map((b) => {
        const items = list.filter((c) => c.branch === b).sort((x, y) => x.order - y.order);
        return (
          <section key={b} className="cbranch cbranch--path" aria-labelledby={`brp-${b}`}>
            <h2 className="cbranch-h ds-head" id={`brp-${b}`}>{BRANCH_LABEL[b]}</h2>
            {items.length ? (
              <ol className="cpath">
                {items.map((c) => {
                  const isNext = c.id === next;
                  return (
                    <li key={c.id}>
                      <button type="button" className={isNext ? "cnode cnode--next" : "cnode"} data-c={c.id} data-state={c.state} onClick={() => onOpen(c)}>
                        <i className={`cmk cmk--${c.state}`} aria-hidden="true" />
                        <b className="cnode-t">{c.title}</b>
                        <small className="cnode-s">
                          {isNext && <><span className="cnode-next">다음 복습</span>{" "}</>}
                          {CONCEPT_STATE[c.state]}{c.dueOn ? ` · 복습 ${dueLabel(c.dueOn, today)}` : ""}
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="cbranch-empty">아직 이 갈래의 개념이 없어요.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ListView({ list, today, onOpen }: ViewProps) {
  return (
    <>
      {BRANCHES.map((b) => {
        const items = list.filter((c) => c.branch === b);
        return (
          <section key={b} className="cbranch" aria-labelledby={`br-${b}`}>
            <h2 className="cbranch-h ds-head" id={`br-${b}`}>{BRANCH_LABEL[b]}</h2>
            {items.length ? (
              <ul className="clist">
                {items.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="crow" data-c={c.id} onClick={() => onOpen(c)}>
                      <b>{c.title}</b>
                      <span className="cstate">{CONCEPT_STATE[c.state]}</span>
                      <small>{c.dueOn ? `복습 예정: ${dueLabel(c.dueOn, today)}` : "복습 예정 없음"}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cbranch-empty">아직 이 갈래의 개념이 없어요.</p>
            )}
          </section>
        );
      })}
    </>
  );
}

function ConceptDetail({ item, onBack }: { item: ConceptListItem; onBack: () => void }) {
  useScreenFocus();
  const [state, setState] = useState<ConceptState>(item.state);
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    logEvent("concept_view", { payload: { conceptId: item.id } });
  }, [item.id]);
  return (
    <>
      <div className="top"><button type="button" className="back" id="back" onClick={onBack}>← 개념</button><span>{CONCEPT_STATE[state]}</span></div>
      <div className="ds-card concept">
        <h1 id="screen-title" className="ds-card-title">{item.title}</h1>
        <p>{item.body}</p>
        {item.quiz ? <QuizBlock conceptId={item.id} quiz={item.quiz} via="concepts" onAnswered={(r) => setState(r.state)} /> : null}
      </div>
    </>
  );
}
