"use client";

/**
 * 카드 앞면 — 판단 전 자료(PublicCase)만 그린다. 결과 자료·결과색(ds-up/ds-down)·형광펜(ds-hl)은 이 폴더에서 쓰지 않는다.
 * 세 판 「흐름」「숫자」(기본)「그때」. 판 탭에서는 끌기를 시작하지 않는다(카드의 포인터 캡처가 탭 클릭을 가로채지 않게).
 */
import { useRef } from "react";
import { Spark } from "@/components/common/Spark";
import { fmtIndex, PANELS } from "@/lib/client/format";
import type { PanelKind, PublicCase } from "@/lib/client/types";

type Props = { card: PublicCase; active: boolean; panel: PanelKind; onPanel?: (k: PanelKind) => void };

export function CardFace({ card, active, panel, onPanel }: Props) {
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
        {panel === "flow" ? <FlowBlock card={card} /> : panel === "then" ? <ThenBlock card={card} /> : <NumbersBlock card={card} />}
      </div>
    </div>
  );
}

const last = (xs: readonly number[]) => xs[xs.length - 1];

function FlowBlock({ card }: { card: PublicCase }) {
  const f = card.panels.flow;
  return (
    <div className="block">
      <h3 className="blk-h">판단일까지 가격 흐름 (처음 = 100)</h3>
      <Spark series={[{ pts: f.index14, cls: "ln-main" }, { pts: f.market14, cls: "ln-bench" }]} />
      <div className="legend">
        <span><i className="ln-main" />이 회사 {fmtIndex(last(f.index14))}</span>
        <span><i className="ln-bench" />시장 {fmtIndex(last(f.market14))}</span>
      </div>
      <div className="ds-kv"><span>거래량 추세</span><b>{f.volumeTrend}<small>최근 {f.windowDays}일</small></b></div>
      <p className="panel-note">판단일 이후의 흐름은 판단한 뒤에 보여요.</p>
    </div>
  );
}

function Kv({ k, v, s }: { k: string; v: string | null; s?: string }) {
  return <div className="ds-kv"><span>{k}</span><b>{v ?? "데이터 없음"}{s && <small>{s}</small>}</b></div>;
}

function NumbersBlock({ card }: { card: PublicCase }) {
  const n = card.panels.numbers;
  return (
    <div className="block">
      <h3 className="blk-h">성장 <small>{n.asOfRelative}</small></h3>
      <Kv k="매출 성장률" v={n.growth.revYoy} />
      <Kv k="영업이익률 추이" v={n.growth.opm} />
      <Kv k="EPS 성장률" v={n.growth.epsYoy} />
      <Kv k="가이던스" v={n.growth.guidance} />
      <h3 className="blk-h">밸류에이션</h3>
      <Kv k="PER" v={n.valuation.per} s={`업종 중앙값 ${n.valuation.perSector}`} />
      <Kv k="PBR" v={n.valuation.pbr} />
      <Kv k="PSR" v={n.valuation.psr} />
      <h3 className="blk-h">재무건전성</h3>
      <Kv k="부채비율" v={n.health.debtRatio} />
      <Kv k="순현금" v={n.health.netCash} />
      <Kv k="잉여현금흐름" v={n.health.fcf} />
    </div>
  );
}

function ThenBlock({ card }: { card: PublicCase }) {
  const t = card.panels.then;
  return (
    <div className="block">
      <h3 className="blk-h">금리</h3>
      <div className="ds-kv"><span>기준금리</span><b>{t.rate}<small>{t.rateTrend}</small></b></div>
      {t.fxNote && <Kv k="환율" v={t.fxNote} />}
      {t.commodityNote && <Kv k="원자재" v={t.commodityNote} />}
      <h3 className="blk-h">판단일 전 소식</h3>
      <ul className="ctx-notes">
        {t.notes.map((x, i) => (
          <li key={i}><span className="ctx-when ds-num">{x.when}</span><span className="ds-label">{x.sourceKind}</span><p>{x.text}</p></li>
        ))}
      </ul>
      <p className="panel-note">회사 이름과 정확한 날짜는 판단한 뒤에 보여요.</p>
    </div>
  );
}
