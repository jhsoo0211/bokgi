"use client";

/**
 * 카드 앞면 — 판단 전 자료(PublicCase)만 그린다. 결과 자료·결과색(ds-up/ds-down)·형광펜(ds-hl)은 이 폴더에서 쓰지 않는다.
 * 세 판 「흐름」「숫자」(기본)「그때」. 판 탭에서는 끌기를 시작하지 않는다(카드의 포인터 캡처가 탭 클릭을 가로채지 않게).
 * 정보 수준(D16, 02 §7.1 깊이 표): show(묶음별 켬·끔)가 끈 묶음은 DOM에 그리지 않는다 — 판은 늘 셋이고 깊이만 바뀐다.
 *   흐름: 지수 경로(늘) · 시장 비교선(marketLine) · 거래량 추세(volume)
 *   숫자: 매출 성장·영업이익률·PER vs 업종(늘) · EPS·가이던스(growthDetail) · PBR·PSR(valuationDetail) · 부채비율(healthBasic) · 순현금·FCF(healthDetail)
 *   그때: 금리 수준과 방향(늘) · 이슈 메모 전부(allNotes, 끄면 공시·통계 우선 2개) · 환율·원자재 메모(fxCommodity)
 * 판 상자 높이는 고정(452px)이고, 내용이 넘치면 판 안에서 스크롤한다(실제 카드의 이슈 5개 + 원자재 메모, 글자 200% 등).
 */
import { useRef } from "react";
import { Spark } from "@/components/common/Spark";
import { fmtIndex, PANELS } from "@/lib/client/format";
import type { PanelKind, PanelPrefs, PublicCase } from "@/lib/client/types";

type Props = { card: PublicCase; active: boolean; panel: PanelKind; show: PanelPrefs; onPanel?: (k: PanelKind) => void };

export function CardFace({ card, active, panel, show, onPanel }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const months = Math.round(card.horizonDays / 30);
  const open = (k: PanelKind) => {
    if (k === panel || !onPanel) return;
    onPanel(k);
    if (panelRef.current) panelRef.current.scrollTop = 0;
  };
  return (
    <div className="ds-card sc-face">
      {active && <h2 className="sr-only">판단 카드</h2>}
      <p className="meta">
        업종 <b>{card.sectorPublic}</b> · 규모 <b>{card.sizeBucket}</b> · 기간 <b>{months}개월</b> · <b>{card.yearPublic}년</b> · 날짜 비공개
      </p>
      <div className="ds-lens panel-tabs" role="group" aria-label="카드 정보" onPointerDown={(e) => e.stopPropagation()}>
        {PANELS.map(([k, t]) => (
          <button key={k} type="button" data-panel={k} aria-pressed={panel === k} onClick={() => open(k)}>{t}</button>
        ))}
      </div>
      <div className="panel" ref={panelRef}>
        {panel === "flow" ? <FlowBlock card={card} show={show} /> : panel === "then" ? <ThenBlock card={card} show={show} /> : <NumbersBlock card={card} show={show} />}
      </div>
    </div>
  );
}

const last = (xs: readonly number[]) => xs[xs.length - 1];

type BlockProps = { card: PublicCase; show: PanelPrefs };

function FlowBlock({ card, show }: BlockProps) {
  const f = card.panels.flow;
  return (
    <div className="block">
      <h3 className="blk-h">판단일까지 가격 흐름 (처음 = 100)</h3>
      <Spark series={show.marketLine ? [{ pts: f.index14, cls: "ln-main" }, { pts: f.market14, cls: "ln-bench" }] : [{ pts: f.index14, cls: "ln-main" }]} />
      <div className="legend">
        <span><i className="ln-main" />이 회사 {fmtIndex(last(f.index14))}</span>
        {show.marketLine && <span><i className="ln-bench" />시장 {fmtIndex(last(f.market14))}</span>}
      </div>
      {show.volume && <div className="ds-kv"><span>거래량 추세</span><b>{f.volumeTrend}<small>최근 {f.windowDays}일</small></b></div>}
      <p className="panel-note">판단일 이후의 흐름은 판단한 뒤에 보여요.</p>
    </div>
  );
}

function Kv({ k, v, s }: { k: string; v: string | null; s?: string }) {
  return <div className="ds-kv"><span>{k}</span><b>{v ?? "데이터 없음"}{s && <small>{s}</small>}</b></div>;
}

function NumbersBlock({ card, show }: BlockProps) {
  const n = card.panels.numbers;
  return (
    <div className="block">
      <h3 className="blk-h">성장 <small>{n.asOfRelative}</small></h3>
      <Kv k="매출 성장률" v={n.growth.revYoy} />
      <Kv k="영업이익률 추이" v={n.growth.opm} />
      {show.growthDetail && <><Kv k="EPS 성장률" v={n.growth.epsYoy} /><Kv k="가이던스" v={n.growth.guidance} /></>}
      <h3 className="blk-h">밸류에이션</h3>
      <Kv k="PER" v={n.valuation.per} s={`업종 중앙값 ${n.valuation.perSector}`} />
      {show.valuationDetail && <><Kv k="PBR" v={n.valuation.pbr} /><Kv k="PSR" v={n.valuation.psr} /></>}
      {(show.healthBasic || show.healthDetail) && <h3 className="blk-h">재무건전성</h3>}
      {show.healthBasic && <Kv k="부채비율" v={n.health.debtRatio} />}
      {show.healthDetail && <><Kv k="순현금" v={n.health.netCash} /><Kv k="잉여현금흐름" v={n.health.fcf} /></>}
    </div>
  );
}

type Note = PublicCase["panels"]["then"]["notes"][number];
/** 이슈 메모를 다 보이지 않을 때: 공시·통계를 먼저, 같은 무게면 판단일에 가까운(나중) 것부터 2개 — 보이는 순서는 원래(시간) 순서 */
function pickNotes(notes: readonly Note[]): Note[] {
  const rank = (x: Note) => (x.sourceKind === "보도" ? 1 : 0);
  const keep = new Set(
    notes.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || b.i - a.i).slice(0, 2).map((o) => o.i),
  );
  return notes.filter((_, i) => keep.has(i));
}

function ThenBlock({ card, show }: BlockProps) {
  const t = card.panels.then;
  const notes = show.allNotes ? t.notes : pickNotes(t.notes);
  return (
    <div className="block">
      <h3 className="blk-h">금리</h3>
      <div className="ds-kv"><span>기준금리</span><b>{t.rate}<small>{t.rateTrend}</small></b></div>
      {show.fxCommodity && t.fxNote && <Kv k="환율" v={t.fxNote} />}
      {show.fxCommodity && t.commodityNote && <Kv k="원자재" v={t.commodityNote} />}
      <h3 className="blk-h">판단일 전 소식{!show.allNotes && t.notes.length > notes.length && <small>공시·통계 우선 {notes.length}개</small>}</h3>
      <ul className="ctx-notes">
        {notes.map((x, i) => (
          <li key={i}><span className="ctx-when ds-num">{x.when}</span><span className="ds-label">{x.sourceKind}</span><p>{x.text}</p></li>
        ))}
      </ul>
      <p className="panel-note">회사 이름과 정확한 날짜는 판단한 뒤에 보여요.</p>
    </div>
  );
}
