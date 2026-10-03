#!/usr/bin/env python3
"""결과 계산: 기간 수익률(배당 재투자·분할 반영), 시장 대비 %p, 세 상태(±1%p), 결과 경로 14점.

입력은 원시 종가(분할 미조정)와 배당·분할 목록이다. 이미 분할 조정된 종가라면 --splits를 주지 않는다.
연구 저장소의 채택 가격 자료는 계산 입력으로만 쓰고 결과 파일에는 파생값(지수·수익률)만 남긴다(ADR-0003).

사용:
  python3 tools/cards/outcome.py --stock s.csv --bench m.csv --start 2023-09-15 --end 2024-03-15 \
      [--dividends div.csv] [--splits splits.csv] [--bench-dividends bdiv.csv]
CSV: 종가 date,close · 배당 ex_date,amount(그날 기준 1주당) · 분할 date,ratio(4대1이면 4)
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardlib  # noqa: E402


class OutcomeError(ValueError):
    pass


@dataclass(frozen=True)
class Dividend:
    ex_date: date
    amount: float          # 그날 기준 1주당 현금


@dataclass(frozen=True)
class Split:
    date: date
    ratio: float           # 새 주식 수 ÷ 옛 주식 수 (4대1 분할 = 4.0, 1대10 병합 = 0.1)


# ---------- 순수 함수 ----------

def _check_series(dates: Sequence[date], closes: Sequence[float]) -> None:
    if len(dates) != len(closes) or len(dates) < 2:
        raise OutcomeError("날짜와 종가의 개수가 같고 2개 이상이어야 해요")
    if list(dates) != sorted(set(dates)):
        raise OutcomeError("날짜는 겹치지 않고 오름차순이어야 해요")
    if any(not (isinstance(c, (int, float)) and math.isfinite(c) and c > 0) for c in closes):
        raise OutcomeError("종가는 0보다 큰 유한한 수여야 해요")


def _map_to_sessions(dates: Sequence[date], events: Iterable[tuple[date, float]]) -> dict[int, list[float]]:
    """사건 날짜를 그날 또는 다음 거래일 위치로 옮긴다. 첫날(매수일)과 마지막 날 뒤 사건은 무시한다."""
    mapped: dict[int, list[float]] = {}
    for when, value in events:
        for i in range(1, len(dates)):
            if dates[i] >= when:
                if dates[i - 1] < when:
                    mapped.setdefault(i, []).append(value)
                break
    return mapped


def total_return_index(dates: Sequence[date], closes: Sequence[float],
                       dividends: Iterable[Dividend] = (), splits: Iterable[Split] = ()) -> list[float]:
    """첫 날 종가에 1주를 샀다고 보고, 분할은 주식 수에, 배당은 그날 종가로 재투자해 평가한 지수(첫 날 = 100)."""
    _check_series(dates, closes)
    split_at = _map_to_sessions(dates, [(s.date, s.ratio) for s in splits])
    div_at = _map_to_sessions(dates, [(d.ex_date, d.amount) for d in dividends])
    for ratios in split_at.values():
        if any(not (math.isfinite(r) and r > 0) for r in ratios):
            raise OutcomeError("분할 비율은 0보다 커야 해요")
    shares, out = 1.0, [100.0]
    for i in range(1, len(dates)):
        for ratio in split_at.get(i, []):
            shares *= ratio
        cash = sum(div_at.get(i, [])) * shares
        if cash:
            shares += cash / closes[i]
        out.append(100.0 * shares * closes[i] / closes[0])
    return out


def return_pct(index: Sequence[float]) -> float:
    """지수(첫 값 100)의 기간 수익률(%), 소수 첫째 자리."""
    return round(index[-1] / index[0] * 100.0 - 100.0, 1)


def sample_positions(n: int, points: int = cardlib.INDEX_POINTS) -> list[int]:
    """n개 관측치에서 처음·끝을 포함해 고르게 points개 위치."""
    if n < points:
        raise OutcomeError(f"관측치가 {points}개 이상이어야 해요 (지금 {n}개)")
    return [int(math.floor(k * (n - 1) / (points - 1) + 0.5)) for k in range(points)]


def path14(index: Sequence[float], points: int = cardlib.INDEX_POINTS) -> list[float]:
    """결과 경로 14점: 판단일 = 100, 소수 첫째 자리. 끝값은 100 + 수익률과 정확히 같게 맞춘다."""
    picked = [index[i] for i in sample_positions(len(index), points)]
    base = picked[0]
    path = [round(100.0 * v / base, 1) for v in picked]
    path[0] = 100.0
    path[-1] = round(100.0 + return_pct(index), 1)
    return path


def relative_pp(r: float, b: float) -> float:
    return cardlib.relative_pp(r, b)


def state_of(r: float, b: float) -> str:
    return cardlib.result_state(cardlib.relative_pp(r, b))


def compute_outcome(stock: Sequence[tuple[date, float]], bench: Sequence[tuple[date, float]],
                    start: date, end: date, *, dividends: Iterable[Dividend] = (),
                    splits: Iterable[Split] = (), bench_dividends: Iterable[Dividend] = ()) -> dict:
    """판단일(start)부터 end까지. 두 시계열이 모두 거래한 날만 써서 14점의 날짜를 맞춘다."""
    if end <= start:
        raise OutcomeError("끝 날짜가 판단일보다 뒤여야 해요")
    s = {d: c for d, c in stock if start <= d <= end}
    m = {d: c for d, c in bench if start <= d <= end}
    if start not in s or start not in m:
        raise OutcomeError(f"판단일 {start} 종가가 두 시계열 모두에 있어야 해요")
    days = sorted(set(s) & set(m))
    if days[-1] != max(s) or days[-1] != max(m):
        raise OutcomeError("두 시계열의 마지막 거래일이 달라요 — 끝 날짜를 맞춰 주세요")
    s_index = total_return_index(days, [s[d] for d in days], dividends, splits)
    m_index = total_return_index(days, [m[d] for d in days], bench_dividends, ())
    r, b = return_pct(s_index), return_pct(m_index)
    rel = relative_pp(r, b)
    return {
        "startDate": days[0].isoformat(), "endDate": days[-1].isoformat(),
        "returnPct": r, "benchReturnPct": b, "relativePp": rel, "state": cardlib.result_state(rel),
        "pricePath": path14(s_index), "benchPath": path14(m_index),
    }


# ---------- CSV ----------

def read_closes(path: Path | str) -> list[tuple[date, float]]:
    with open(path, encoding="utf-8", newline="") as f:
        rows = [(date.fromisoformat(r["date"].strip()), float(r["close"])) for r in csv.DictReader(f)]
    return sorted(rows)


def read_dividends(path: Path | str | None) -> list[Dividend]:
    if not path:
        return []
    with open(path, encoding="utf-8", newline="") as f:
        return [Dividend(date.fromisoformat(r["ex_date"].strip()), float(r["amount"])) for r in csv.DictReader(f)]


def read_splits(path: Path | str | None) -> list[Split]:
    if not path:
        return []
    with open(path, encoding="utf-8", newline="") as f:
        return [Split(date.fromisoformat(r["date"].strip()), float(r["ratio"])) for r in csv.DictReader(f)]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="결과 수익률·세 상태·결과 경로 14점을 계산한다.")
    p.add_argument("--stock", required=True, help="회사 종가 CSV (date,close; 분할 미조정 원시 종가)")
    p.add_argument("--bench", required=True, help="시장 종가 CSV (date,close)")
    p.add_argument("--start", required=True, help="판단일 YYYY-MM-DD")
    p.add_argument("--end", required=True, help="끝 날짜 YYYY-MM-DD (그날 이전 마지막 거래일까지)")
    p.add_argument("--dividends", help="회사 배당 CSV (ex_date,amount)")
    p.add_argument("--splits", help="회사 분할 CSV (date,ratio)")
    p.add_argument("--bench-dividends", help="시장 배당 CSV — 시장도 총수익으로 비교할 때")
    a = p.parse_args(argv)
    try:
        result = compute_outcome(read_closes(a.stock), read_closes(a.bench),
                                 date.fromisoformat(a.start), date.fromisoformat(a.end),
                                 dividends=read_dividends(a.dividends), splits=read_splits(a.splits),
                                 bench_dividends=read_dividends(a.bench_dividends))
    except (OutcomeError, ValueError, KeyError) as e:
        print(f"계산 실패: {e}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"→ 시장 대비 {result['relativePp']:+.1f}%p · {cardlib.STATE_KO[result['state']]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
