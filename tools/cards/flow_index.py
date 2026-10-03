#!/usr/bin/env python3
"""「흐름」 판의 파생 지수: 판단일까지의 종가 → 14점 지수(+ 시장 지수, 거래량 추이 낱말).

창(window)은 판단일을 마지막 점으로 하는 windowDays 달력 일이다. 판단일 이후 행은 절대 쓰지 않는다.
기준점(anchor):
  start    — 창의 첫 날 = 100 (기본). 카드의 index14·market14는 이 기준이다: 프로토타입 화면이
             '처음 = 100'으로 그리고 끝값(예: 115)을 범례에 쓰며, check_case.py가 첫 값 100을 검사한다.
  judgment — 판단일 = 100 (기획 문서의 '판단 시점 100 기준' 표기). 비교·분석용이며 카드에 넣으면
             첫 값이 100이 아니어서 check_case.py를 통과하지 못한다.
원시 가격·거래량 값은 결과에 남기지 않는다(ADR-0003).

사용:
  python3 tools/cards/flow_index.py --stock s.csv --market m.csv --judgment-date 2023-09-15 --window-days 180
CSV: date,close[,volume]  (시장 CSV는 date,close)
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardlib  # noqa: E402

ANCHORS = ("start", "judgment")


class FlowError(ValueError):
    pass


def sample_positions(n: int, points: int = cardlib.INDEX_POINTS) -> list[int]:
    """n개 관측치에서 첫 점과 끝 점(판단일)을 포함해 고르게 points개 위치."""
    if n < points:
        raise FlowError(f"창 안의 관측치가 {points}개 이상이어야 해요 (지금 {n}개)")
    return [int(math.floor(k * (n - 1) / (points - 1) + 0.5)) for k in range(points)]


def normalize(values: Sequence[float], anchor: str = "start") -> list[float]:
    if anchor not in ANCHORS:
        raise FlowError(f"anchor는 {ANCHORS} 중 하나예요")
    if any(not (isinstance(v, (int, float)) and math.isfinite(v) and v > 0) for v in values):
        raise FlowError("종가는 0보다 큰 유한한 수여야 해요")
    pos = 0 if anchor == "start" else len(values) - 1
    out = [round(100.0 * v / values[pos], 1) for v in values]
    out[pos] = 100.0
    return out


def flow_index(closes: Sequence[float], market_closes: Sequence[float],
               points: int = cardlib.INDEX_POINTS, anchor: str = "start") -> dict[str, list[float]]:
    """같은 날짜로 맞춘 창 안의 종가(오래된 것 → 판단일) → {"index14", "market14"}."""
    if len(closes) != len(market_closes):
        raise FlowError("회사와 시장 종가의 개수가 같아야 해요(같은 날짜로 맞춘 뒤 넣어 주세요)")
    pos = sample_positions(len(closes), points)
    return {
        "index14": normalize([closes[i] for i in pos], anchor),
        "market14": normalize([market_closes[i] for i in pos], anchor),
    }


def volume_trend(volumes: Sequence[float], up: float = 1.2, down: float = 0.8) -> str:
    """창의 마지막 1/3 평균 거래량 ÷ 처음 1/3 평균 → 증가(≥1.2)·감소(≤0.8)·유지."""
    if len(volumes) < 3:
        raise FlowError("거래량은 3개 이상이어야 해요")
    third = len(volumes) // 3
    first, last = statistics.fmean(volumes[:third]), statistics.fmean(volumes[-third:])
    if first <= 0:
        raise FlowError("처음 구간의 평균 거래량이 0이에요")
    ratio = last / first
    return "증가" if ratio >= up else "감소" if ratio <= down else "유지"


def window(rows: dict[date, dict], judgment: date, window_days: int) -> list[date]:
    """(판단일 − windowDays, 판단일] 안의 날짜. 판단일 이후 날짜는 버린다."""
    start = judgment - timedelta(days=window_days)
    return sorted(d for d in rows if start < d <= judgment)


def build_flow_panel(stock: dict[date, dict], market: dict[date, dict], judgment: date,
                     window_days: int, anchor: str = "start") -> tuple[dict, list[str]]:
    """CLI용: 행 사전 → public.panels.flow 모양과 안내 메시지."""
    notes: list[str] = []
    later = sum(1 for d in stock if d > judgment) + sum(1 for d in market if d > judgment)
    if later:
        notes.append(f"판단일 이후 {later}행은 쓰지 않았어요")
    days = [d for d in window(stock, judgment, window_days) if d in market]
    if not days:
        raise FlowError("창 안에 두 시계열이 함께 있는 날이 없어요")
    if days[-1] != judgment:
        notes.append(f"판단일({judgment}) 종가가 없어 마지막 거래일({days[-1]})을 판단일로 썼어요")
    panel = flow_index([stock[d]["close"] for d in days], [market[d]["close"] for d in days], anchor=anchor)
    volumes = [stock[d]["volume"] for d in days if stock[d].get("volume") is not None]
    if len(volumes) == len(days):
        panel["volumeTrend"] = volume_trend(volumes)
    else:
        panel["volumeTrend"] = "유지"
        notes.append("거래량 열이 없어 volumeTrend를 '유지'로 두었어요 — 직접 확인해 주세요")
    panel["windowDays"] = window_days
    return panel, notes


def read_rows(path: Path | str) -> dict[date, dict]:
    rows: dict[date, dict] = {}
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            d = date.fromisoformat(r["date"].strip())
            volume = r.get("volume")
            rows[d] = {"close": float(r["close"]), "volume": float(volume) if volume not in (None, "") else None}
    return rows


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="흐름 판 14점 지수(판단일까지)를 만든다.")
    p.add_argument("--stock", required=True, help="회사 CSV (date,close[,volume])")
    p.add_argument("--market", required=True, help="시장 CSV (date,close)")
    p.add_argument("--judgment-date", required=True, help="판단일 YYYY-MM-DD (창의 마지막 점)")
    p.add_argument("--window-days", type=int, default=180, help="창 길이(달력 일), 기본 180")
    p.add_argument("--anchor", choices=ANCHORS, default="start", help="기준점(카드는 start)")
    a = p.parse_args(argv)
    try:
        panel, notes = build_flow_panel(read_rows(a.stock), read_rows(a.market),
                                        date.fromisoformat(a.judgment_date), a.window_days, a.anchor)
    except (FlowError, ValueError, KeyError) as e:
        print(f"계산 실패: {e}", file=sys.stderr)
        return 1
    print(json.dumps(panel, ensure_ascii=False))
    for note in notes:
        print(f"참고: {note}", file=sys.stderr)
    if a.anchor != "start":
        print("주의: anchor=judgment 결과는 첫 값이 100이 아니라 카드에 넣으면 check_case.py에서 걸려요", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
