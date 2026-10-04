"use client";

/**
 * 개념 탭: 네 갈래(결과 읽기·숫자 읽기·그때 읽기·내 판단 읽기) 아래 개념 목록, 숙련도 뱃지(테두리만), 복습 예정일.
 * 누르면 설명과 확인 문제(풀면 복습 일정이 정해진다). 형광펜·결과색은 쓰지 않는다(공개 화면 전용).
 * 상세에서 '← 개념 목록'으로 돌아오면 연 개념 줄로 초점·스크롤을 돌려준다(목록 맨 위로 튀지 않게).
 * (곧 들어올 '길' 보기는 같은 목록 자료를 갈래별 단원 길로 그리는 다른 보기다 — ConceptList 자리에서 바꿔 끼운다.)
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useApp } from "@/components/app/AppContext";
import { QuizBlock } from "@/components/common/QuizBlock";
import { ErrorBox, Loading } from "@/components/common/Status";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { api, errorText, isApiError } from "@/lib/client/api";
import { logEvent } from "@/lib/client/events";
import { BRANCHES, BRANCH_LABEL, CONCEPT_STATE, dueLabel, localDayKey } from "@/lib/client/format";
import type { ConceptListItem, ConceptState } from "@/lib/client/types";

export function ConceptsScreen() {
  const [open, setOpen] = useState<ConceptListItem | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  return open
    ? <ConceptDetail key={open.id} item={open} onBack={() => { setReturnTo(open.id); setOpen(null); }} />
    : <ConceptList onOpen={setOpen} returnTo={returnTo} />;
}

function ConceptList({ onOpen, returnTo }: { onOpen: (c: ConceptListItem) => void; returnTo: string | null }) {
  useScreenFocus();
  const { onUnauthorized } = useApp();
  const [list, setList] = useState<ConceptListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const restored = useRef(false);
  const today = localDayKey();

  useEffect(() => {
    if (!list || !returnTo || restored.current) return;
    restored.current = true;
    const row = [...document.querySelectorAll<HTMLElement>(".crow")].find((e) => e.dataset.c === returnTo);
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
      <div className="top"><span>개념</span><span className="ds-num">{list.length}개</span></div>
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
      <p className="hint">확인 문제를 풀면 복습 날짜가 정해져요 (1·3·7·21일).</p>
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
      <div className="top"><button type="button" className="back" id="back" onClick={onBack}>← 개념 목록</button><span>{CONCEPT_STATE[state]}</span></div>
      <div className="ds-card concept">
        <h1 id="screen-title" className="ds-card-title">{item.title}</h1>
        <p>{item.body}</p>
        {item.quiz ? <QuizBlock conceptId={item.id} quiz={item.quiz} via="concepts" onAnswered={(r) => setState(r.state)} /> : null}
      </div>
    </>
  );
}
