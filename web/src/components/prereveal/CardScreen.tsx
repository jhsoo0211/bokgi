"use client";

/**
 * 오늘: 카드 + 판단 (판단 전 화면). PublicCase만 받는다 — 결과 자료·결과색·형광펜을 쓰지 않는다.
 * 흐름: 판 보기 → 아는 회사 체크(선택) → 핵심 근거 1개(필수) → 위험 요인(선택) → 확신도 1~5(필수, 기본값 없음)
 *       → 스와이프 / 버튼 / 키보드 ← → → 되돌리기 알림(설정한 2.5·5·10초, 또는 바로 공개) → 판단 전송 → 공개(부모가 맡는다)
 * 게이트: 근거와 확신도를 모두 고르기 전에는 스와이프·버튼·키보드가 막힌다. 버튼은 aria-disabled라 눌러도
 *         초점을 잃지 않고 흔들림·안내가 나온다(아래 막대에서 눌렀으면 비어 있는 칸이 보이게 스크롤). 카드가 날아가는 220ms와
 *         되돌리기 창 동안 게이트를 잠근다(이중 판단 방지).
 * 판단 막대: 화면 아래(아래 탭 위)에 붙는 막대에 두 단추를 같은 무게로 둔다(ecc 감사 — 한쪽만 채우면 그쪽이 기본값처럼 보여 기운다).
 *         방향은 화살표와 낱말로만 구분한다. 게이트가 열리면 두 단추가 함께 진해지고 막대 위 괘선이 잉크가 된다.
 *         막대는 단추만 담아 낮게 둔다(첫 화면에서 판 아래 '더 보기'를 덮지 않게). 물음 "n개월 뒤, 이 회사는"은 막대가 제자리에 놓이는
 *         화면 끝(막대 바로 위)에 두고 막대 묶음의 이름으로 쓴다. 막혔을 때만 막대 위에 안내 한 줄이 붙는다.
 * 판단은 되돌리기 창이 끝나거나 [바로 공개]를 누를 때 보낸다. 창 안에서 다른 탭으로 가거나 페이지를 떠나면
 * 공개 없이 보내 두고(일지에 '결과 대기'), 오늘 탭으로 돌아오면 공개한다. 되돌리기는 클라이언트 보류라 서버 호출이 없고,
 * 방향만 취소한다 — 고른 근거·확신도·위험·아는 회사는 그대로 남는다(방향만 잘못 밀었을 때 다시 고르는 수고를 덜게).
 * 알림에 초점이나 포인터가 있는 동안 타이머를 멈춘다(키보드로 판단하면 초점이 [바로 공개]로 간다). 알림 문구에 제스처 메타(망설임 등)는 없다 — 기록만.
 * 정보 수준(D16): 카드를 처음 고르는 순간의 설정으로 그 카드의 깊이가 고정된다(draft.view). 손대기 전에는 설정을 바로 따른다.
 *         숨긴 묶음이 있으면 판 아래 "핵심만 보고 있어요 · 더 보기" — 이 카드에서만 전부 펼친다(panel_expand). 판단에는 그 수준과
 *         숨겨져 있던 묶음(펼쳤으면 [])을 함께 보낸다. 위험 칩 묶음이 꺼져 있으면 위험 요인은 묻지 않고 null로 보낸다.
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useApp } from "@/components/app/AppContext";
import { EntryStrip } from "@/components/common/EntryStrip";
import { TodayTop, type SessionReviews } from "@/components/common/TodayTop";
import { usePausableTimeout } from "@/hooks/usePausableTimeout";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { useSwipeStack } from "@/hooks/useSwipeStack";
import { api, errorText } from "@/lib/client/api";
import { logEvent } from "@/lib/client/events";
import { DEFAULT_PANEL, DIR, LEVEL_MORE } from "@/lib/client/format";
import { draftKey, dropDraft, firstView, getDraft, sanitizeDraft, saveDraft, track, type CardView, type Draft } from "@/lib/client/session";
import { hiddenGroupsOf, INFO_PRESETS } from "@/shared/contract";
import type { Direction, EvidenceOption, GestureMeta, JudgmentBody, PanelKind, PanelPrefs, PublicCase, RiskOption, Today } from "@/lib/client/types";
import { CardFace } from "./CardFace";

type Pending = { body: JudgmentBody; direction: Direction; meta: GestureMeta; label: string; confidence: number; keyboard: boolean; finalizing: boolean };
type Toast = null | { kind: "pending"; text: string; busy: boolean; error: string | null } | { kind: "undone" };
type FocusTarget = "now" | "expanded" | "btnL" | "btnR";

type Props = {
  cards: PublicCase[];   // 스택: 첫 장이 지금 카드, 뒤 두 장은 엿보기
  extra: boolean;        // 한 장 더
  today: Today;
  judged: number;        // 오늘 판단한 카드 수(머리줄·입장 띠)
  reviews?: SessionReviews;   // 머리줄의 복습 칸(한 장 더에는 없다)
  onFinalized: (judgmentId: string, card: PublicCase) => void;
};

const gateOpen = (d: Draft) => !!(d.evidenceId && d.confidence);
const ALL_GROUPS: PanelPrefs = INFO_PRESETS.advanced;

export function CardScreen({ cards, extra, today, judged, reviews, onFinalized }: Props) {
  useScreenFocus();
  const reduced = useReducedMotion();
  const { prefs } = useApp();
  const card = cards[0];
  const months = Math.round(card.horizonDays / 30);
  const dkey = draftKey(card.id, card.version);
  const [draft, setDraft] = useState<Draft>(() => sanitizeDraft(getDraft(dkey), card.evidenceOptions.map((o) => o.id), card.riskOptions.map((o) => o.id)));
  const [locked, setLocked] = useState(false);
  const [blockedHint, setBlockedHint] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const pending = useRef<Pending | null>(null);
  const kbd = useRef(false);
  const inToast = useRef({ pointer: false, focus: false });
  const focusNext = useRef<FocusTarget | null>(null);
  const evRef = useRef<HTMLDivElement>(null);
  const confRef = useRef<HTMLDivElement>(null);
  const timer = usePausableTimeout();

  // 이 카드의 정보 수준: 손대기 전에는 지금 설정, 고르기 시작하면 그때의 설정으로 고정(draft.view)
  const view: CardView = draft.view ?? { level: prefs.infoLevel, prefs: prefs.panelPrefs };
  const show: PanelPrefs = draft.expanded ? ALL_GROUPS : view.prefs;
  const hidden = draft.expanded ? [] : hiddenGroupsOf(view.prefs);
  const open = !locked && gateOpen(draft);

  /* ---------- 고르기 ---------- */
  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch, view: draft.view ?? view };   // 처음 손대는 순간 이 카드의 정보 수준을 고정한다
    setDraft(next);
    saveDraft(dkey, next);
    setBlockedHint(null);
  };
  const ev = (name: Parameters<typeof logEvent>[0], payload: Record<string, unknown> | null = null) =>
    logEvent(name, { caseId: card.id, caseVersion: card.version, payload });

  const pickEvidence = (o: EvidenceOption) => {
    if (locked || draft.evidenceId === o.id) return;   // 핵심 근거는 필수: 다시 눌러도 풀리지 않는다
    update({ evidenceId: o.id });
    ev("evidence_pick", { evidenceId: o.id });
  };
  const pickRisk = (o: RiskOption) => {
    if (locked) return;
    const riskId = draft.riskId === o.id ? null : o.id;   // 위험 요인은 선택: 다시 누르면 풀린다
    update({ riskId });
    ev("risk_pick", { riskId });
  };
  const pickConfidence = (n: number) => {
    if (locked) return;
    update({ confidence: n });
    ev("confidence_pick", { confidence: n });
  };
  const toggleRecognized = (on: boolean) => {
    if (locked) return;
    update({ recognized: on });
    ev("recognize_toggle", { recognized: on });
  };
  const setPanel = (k: PanelKind) => {
    update({ panel: k, panelsViewed: draft.panelsViewed.includes(k) ? draft.panelsViewed : [...draft.panelsViewed, k] });
    ev("panel_view", { panel: k });
  };
  /** '더 보기': 이 카드에서만 묶음을 전부 펼친다(설정은 그대로). 판단의 hiddenGroups는 [] */
  const expand = () => {
    if (locked || draft.expanded) return;
    update({ expanded: true });
    ev("panel_expand", { level: view.level, hidden });
    focusNext.current = "expanded";   // 누른 단추가 사라지므로 초점은 바뀐 안내 문장으로
  };

  /* ---------- 게이트에 막힘: 칩 영역 흔들기 + 안내(아래 막대에서 눌렀으면 비어 있는 칸이 보이게) ---------- */
  const blocked = (reveal = false) => {
    if (locked) return;
    const el = !draft.evidenceId ? evRef.current : confRef.current;
    if (el) {
      el.classList.remove("shake");
      el.getBoundingClientRect();   // 다시 흔들리도록 애니메이션을 처음부터
      el.classList.add("shake");
      if (reveal) {
        const r = el.getBoundingClientRect();
        const barTop = document.getElementById("judge")?.getBoundingClientRect().top ?? window.innerHeight;
        if (r.top < 0 || r.bottom > barTop) el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      }
    }
    setBlockedHint(!draft.evidenceId && !draft.confidence ? "먼저 근거 하나와 확신도를 골라 주세요"
      : !draft.evidenceId ? "먼저 근거를 하나 골라 주세요" : "먼저 확신도를 골라 주세요");
    ev("gate_blocked", { missing: [!draft.evidenceId && "evidence", !draft.confidence && "confidence"].filter(Boolean) });
  };

  /* ---------- 판단 ---------- */
  const startPending = (direction: Direction, meta: GestureMeta) => {
    const o = card.evidenceOptions.find((x) => x.id === draft.evidenceId);
    if (!o || !draft.confidence) return;
    setLocked(true);
    pending.current = {
      direction, meta, label: o.label, confidence: draft.confidence, keyboard: meta.via !== "swipe" && kbd.current, finalizing: false,
      body: {
        caseId: card.id, caseVersion: card.version, keyEvidenceId: o.id, riskId: show.riskChips ? draft.riskId : null, direction,
        confidence: draft.confidence, recognized: draft.recognized, panelsViewed: draft.panelsViewed,
        gesture: { via: meta.via, dx: meta.dx, ms: meta.ms, v: meta.v, flips: meta.flips }, isExtra: extra,
        infoLevel: view.level, hiddenGroups: hidden,
      },
    };
  };

  const finalize = async (now: boolean) => {
    const p = pending.current;
    if (!p || p.finalizing) return;
    p.finalizing = true;
    timer.cancel();
    if (now) ev("reveal_now");
    setToast((t) => (t && t.kind === "pending" ? { ...t, busy: true, error: null } : t));
    try {
      const created = await track(api.createJudgment(p.body));
      pending.current = null;
      dropDraft(dkey);
      onFinalized(created.judgmentId, card);
    } catch (e) {
      p.finalizing = false;
      setToast((t) => (t && t.kind === "pending" ? { ...t, busy: false, error: `판단을 보내지 못했어요. ${errorText(e)}` } : t));
    }
  };

  const showToast = () => {
    const p = pending.current;
    if (!p) return;
    inToast.current = { pointer: false, focus: false };
    // 제스처 메타(거리·속도·망설임)는 기록만 — 화면에 보이면 측정당하는 느낌을 준다(02 §3, ecc 감사)
    setToast({ kind: "pending", busy: false, error: null, text: `${DIR[p.direction]} · 근거: ${p.label} · 확신 ${p.confidence}/5` });
    timer.start(prefs.undoSeconds * 1000, () => { void finalize(false); });
    if (p.keyboard) focusNext.current = "now";   // 키보드 사용자는 Enter 한 번으로 바로 공개, 초점이 있는 동안 타이머는 멈춘다
  };

  const stack = useSwipeStack({
    reduced,
    canSwipe: () => !locked && gateOpen(draft),
    onBlocked: () => blocked(false),
    onCommitStart: (direction, meta) => startPending(direction, meta),
    onCommit: () => showToast(),
  });

  const judgeBy = (direction: Direction, via: "button" | "key", keyboard: boolean) => {
    if (locked) return;
    if (!gateOpen(draft)) { blocked(true); return; }
    kbd.current = keyboard;
    stack.commitByButton(direction, via);
  };

  /** 되돌리기: 방향만 취소하고 같은 카드로(고른 근거·확신도·위험·아는 회사는 그대로). 초점은 취소한 방향의 판단 단추로 */
  const undo = () => {
    const p = pending.current;
    if (!p || p.finalizing) return;
    timer.cancel();
    pending.current = null;
    stack.undo();
    setLocked(false);
    setBlockedHint(null);
    setToast({ kind: "undone" });
    ev("undo", { direction: p.direction });
    focusNext.current = p.direction === "outperform" ? "btnR" : "btnL";
  };

  /* 되돌렸어요 알림은 2초 뒤 지운다 */
  useEffect(() => {
    if (toast?.kind !== "undone") return;
    const id = setTimeout(() => setToast((t) => (t?.kind === "undone" ? null : t)), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  /* 렌더 뒤 초점 옮기기. 알림 단추·판단 막대는 화면에 붙어 있어 스크롤하지 않는다 */
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    document.getElementById(f === "expanded" ? "expanded-note" : f)?.focus({ preventScroll: true });
  });

  /* 알림 위 초점·포인터 → 타이머 멈춤 */
  const syncPause = () => {
    if (inToast.current.pointer || inToast.current.focus) timer.pause();
    else timer.resume();
  };

  /* card_view는 카드마다 한 번(탭을 오가도 다시 세지 않는다) */
  useEffect(() => {
    if (firstView(`card:${card.id}`)) logEvent("card_view", { caseId: card.id, caseVersion: card.version, payload: { panel: DEFAULT_PANEL, extra } });
  }, [card.id, card.version, extra]);

  /* 키보드 ← → (입력 칸 밖에서) */
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input[type="text"], textarea') || document.querySelector(".sheet-back")) return;   // 시트가 열려 있으면 뒤 화면은 inert — 판단하지 않는다
    e.preventDefault();
    judgeBy(e.key === "ArrowLeft" ? "underperform" : "outperform", "key", true);
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  /* 되돌리기 창 안에서 화면을 떠나면(탭 이동·새로고침·닫기) 공개 없이 보내 둔다 */
  const flush = useEffectEvent((keepalive: boolean) => {
    const p = pending.current;
    if (!p || p.finalizing) return;
    pending.current = null;
    timer.cancel();
    dropDraft(dkey);
    track(api.createJudgment(p.body, { keepalive })).catch(() => { /* 다시 열면 같은 카드가 다시 나온다 */ });
  });
  useEffect(() => {
    const onHide = () => flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush(false);
    };
  }, []);

  const hint = locked ? "" : blockedHint ?? (open ? "카드를 좌우로 밀거나, 아래 버튼이나 키보드 ← →로 판단해요"
    : !draft.evidenceId && !draft.confidence ? "근거 하나와 확신도를 고르면 판단할 수 있어요"
    : !draft.evidenceId ? "근거를 하나 고르면 판단할 수 있어요" : "확신도를 고르면 판단할 수 있어요");

  const n = Math.min(3, cards.length - stack.idx);
  const visible = Array.from({ length: Math.max(0, n) }, (_, i) => ({ c: cards[stack.idx + i], depth: i })).reverse();
  const onTop = stack.idx === 0;   // 지금 카드가 맨 위(날아가지 않았다)

  return (
    <>
      <h1 id="screen-title" className="sr-only">{extra ? "한 장 더 — 판단 카드" : "오늘의 판단 카드"}</h1>
      <TodayTop judged={judged} label={extra ? "한 장 더" : "판단"} reviews={extra ? undefined : reviews} cardInProgress={draft.view !== null} />
      <EntryStrip today={today} judged={judged} extraMode={extra} />
      <div className="stage" id="stage" ref={stack.stageRef}>
        {visible.map(({ c, depth }) => {
          const mine = depth === 0 && c.id === card.id;
          return (
            <div
              key={c.id}
              className={depth ? `sc n${depth}` : "sc"}
              ref={depth === 0 ? stack.topRef : undefined}
              inert={depth > 0 || locked ? true : undefined}
              {...(depth === 0 ? stack.handlers : {})}
            >
              <CardFace card={c} active={depth === 0} panel={mine ? draft.panel : DEFAULT_PANEL} show={c.id === card.id ? show : prefs.panelPrefs} onPanel={mine ? setPanel : undefined} />
              <div className="sc-stamp sc-stamp--r" aria-hidden="true">앞섰다</div>
              <div className="sc-stamp sc-stamp--l" aria-hidden="true">뒤졌다</div>
            </div>
          );
        })}
        {n <= 0 && <div className="sc-empty">이번 세션의 카드를 모두 풀었어요</div>}
      </div>
      {onTop && hidden.length > 0 && (
        <button type="button" className="more-line" id="expand" disabled={locked} onClick={expand}>
          {LEVEL_MORE[view.level]} · <u>더 보기</u>
        </button>
      )}
      {onTop && draft.expanded && hiddenGroupsOf(view.prefs).length > 0 && (
        <p className="more-line more-line--done" id="expanded-note" tabIndex={-1} role="status">이 카드에서만 전부 펼쳐 보고 있어요</p>
      )}
      <p className="hint" id="hint" aria-live="polite">{hint}</p>
      <fieldset className="gate" id="gate" disabled={locked}>
        <legend className="sr-only">판단 전에 고르기</legend>
        <label className="check">
          <input type="checkbox" id="recog" checked={draft.recognized} onChange={(e) => toggleRecognized(e.target.checked)} /> 이 회사를 아는 것 같아요
        </label>
        <p className="q ds-head" id="ev-q">가장 중요하게 본 정보는?</p>
        <div className="chips chips--why" id="ev" role="group" aria-labelledby="ev-q" ref={evRef} onAnimationEnd={(e) => e.currentTarget.classList.remove("shake")}>
          {card.evidenceOptions.map((o) => (
            <button key={o.id} type="button" className="ds-chip ds-chip--why" data-ev={o.id} aria-pressed={draft.evidenceId === o.id} onClick={() => pickEvidence(o)}>
              <span className="ds-chip-label">{o.label}</span>
              <small className="ds-chip-why">{o.why}</small>
            </button>
          ))}
        </div>
        {show.riskChips && (
          <>
            <p className="q ds-head" id="risk-q">가장 큰 위험 요인은? <small className="ds-muted">(선택)</small></p>
            <div className="chips" id="risk" role="group" aria-labelledby="risk-q">
              {card.riskOptions.map((o) => (
                <button key={o.id} type="button" className="ds-chip" data-risk={o.id} aria-pressed={draft.riskId === o.id} onClick={() => pickRisk(o)}>{o.label}</button>
              ))}
            </div>
          </>
        )}
        <div className="ds-conf">
          <span className="conf-label" id="conf-q">얼마나 확신하나요</span>
          <div className="dots" id="conf" role="group" aria-labelledby="conf-q" aria-describedby="conf-scale" ref={confRef} onAnimationEnd={(e) => e.currentTarget.classList.remove("shake")}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" aria-pressed={draft.confidence === v} aria-label={`확신도 ${v}`} onClick={() => pickConfidence(v)}>{v}</button>
            ))}
          </div>
        </div>
        <p className="conf-scale" id="conf-scale">1 거의 모르겠다 · 5 매우 확신한다</p>
      </fieldset>
      <p className="hint">맞히는 게 아니라 근거를 남기는 연습이에요</p>
      <h2 className="judge-q ds-head" id="judge-q">{months}개월 뒤, 이 회사는</h2>
      <div className={open ? "judge-bar judge-bar--open" : "judge-bar"} id="judge" role="group" aria-labelledby="judge-q">
        {blockedHint && <p className="judge-note" aria-hidden="true">{blockedHint}</p>}
        <div className="swipe">
          <button type="button" className="ds-btn judge-btn" id="btnL" aria-disabled={!open} aria-describedby="hint" aria-keyshortcuts="ArrowLeft"
            onClick={(e) => judgeBy("underperform", "button", e.detail === 0)}>
            ← 시장보다 뒤졌다
          </button>
          <button type="button" className="ds-btn judge-btn" id="btnR" aria-disabled={!open} aria-describedby="hint" aria-keyshortcuts="ArrowRight"
            onClick={(e) => judgeBy("outperform", "button", e.detail === 0)}>
            시장보다 앞섰다 →
          </button>
        </div>
      </div>
      <p
        className="toast" id="toast" role="status"
        onPointerEnter={() => { inToast.current.pointer = true; syncPause(); }}
        onPointerLeave={() => { inToast.current.pointer = false; syncPause(); }}
        onFocus={() => { inToast.current.focus = true; syncPause(); }}
        onBlur={(e) => {
          if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
          inToast.current.focus = false;
          syncPause();
        }}
      >
        {toast?.kind === "pending" && (
          <>
            {toast.text}
            {toast.error && <><br />{toast.error}</>}
            <span className="toast-acts">
              <button type="button" id="undo" disabled={toast.busy} onClick={undo}>되돌리기</button>
              <button type="button" id="now" disabled={toast.busy} onClick={() => { void finalize(true); }}>{toast.error ? "다시 보내기" : "바로 공개"}</button>
            </span>
          </>
        )}
        {toast?.kind === "undone" && "되돌렸어요. 근거·확신도는 그대로 두었어요."}
      </p>
    </>
  );
}
