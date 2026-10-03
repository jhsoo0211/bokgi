"""outcome.py: 배당 재투자·분할을 반영한 수익률, 시장 대비 %p, ±1%p 세 상태, 결과 경로 14점, CSV CLI."""
from __future__ import annotations

import json
from datetime import date, timedelta

import pytest

import cardlib
import outcome
from outcome import Dividend, Split

D = [date(2024, 1, 2), date(2024, 1, 3), date(2024, 1, 4), date(2024, 1, 5)]


def test_dividend_is_reinvested_at_ex_date_close() -> None:
    idx = outcome.total_return_index(D[:3], [100.0, 100.0, 100.0], dividends=[Dividend(D[1], 2.0)])
    assert idx == pytest.approx([100.0, 102.0, 102.0])
    assert outcome.return_pct(idx) == 2.0


def test_split_keeps_value_continuous() -> None:
    raw = [100.0, 50.0, 55.0]                      # 2대1 분할 뒤 원시 종가가 반으로
    assert outcome.return_pct(outcome.total_return_index(D[:3], raw, splits=[Split(D[1], 2.0)])) == 10.0
    assert outcome.return_pct(outcome.total_return_index(D[:3], raw)) == -45.0   # 분할을 빠뜨리면 틀린 값


def test_split_then_dividend_on_post_split_shares() -> None:
    idx = outcome.total_return_index(D, [100.0, 50.0, 50.0, 55.0],
                                     dividends=[Dividend(D[2], 0.5)], splits=[Split(D[1], 2.0)])
    # 주식 2주 → 배당 1.0을 50에 재투자 → 2.02주 × 55 = 111.1
    assert idx[-1] == pytest.approx(111.1)
    assert outcome.return_pct(idx) == 11.1


def test_events_outside_holding_period_are_ignored() -> None:
    before = Dividend(date(2023, 12, 29), 5.0)
    on_start = Dividend(D[0], 5.0)                 # 판단일 종가에 샀으므로 그날 배당은 받지 못한다
    after = Split(date(2024, 2, 1), 10.0)
    idx = outcome.total_return_index(D[:3], [100.0, 100.0, 100.0], dividends=[before, on_start], splits=[after])
    assert idx == pytest.approx([100.0, 100.0, 100.0])


def test_event_on_holiday_moves_to_next_session() -> None:
    days = [date(2024, 1, 12), date(2024, 1, 16)]  # 1/15 휴장
    idx = outcome.total_return_index(days, [100.0, 100.0], dividends=[Dividend(date(2024, 1, 15), 1.0)])
    assert idx[-1] == pytest.approx(101.0)


@pytest.mark.parametrize("r,b,rel,state", [
    (4.8, 7.1, -2.3, "behind"),
    (8.1, 7.1, 1.0, "even"),                       # 경계 1.0은 비슷함
    (8.2, 7.1, 1.1, "ahead"),
    (6.1, 7.1, -1.0, "even"),
    (6.0, 7.1, -1.1, "behind"),
    (-16.9, -16.3, -0.6, "even"),
    (57.8, 24.3, 33.5, "ahead"),
])
def test_relative_pp_and_state(r, b, rel, state) -> None:
    assert outcome.relative_pp(r, b) == rel
    assert outcome.state_of(r, b) == state


def test_path14_first_is_100_and_last_matches_return() -> None:
    idx = [100.0 * (1.001 ** i) for i in range(126)]
    path = outcome.path14(idx)
    assert len(path) == 14 and path[0] == 100.0
    assert path[-1] == round(100.0 + outcome.return_pct(idx), 1)


def test_path14_needs_14_observations() -> None:
    with pytest.raises(outcome.OutcomeError):
        outcome.path14([100.0] * 13)


def _series(start: date, days: int, base: float, step: float) -> list[tuple[date, float]]:
    out, d, i = [], start, 0
    while d <= start + timedelta(days=days):
        if d.weekday() < 5:
            out.append((d, base + step * i))
            i += 1
        d += timedelta(days=1)
    return out


def test_compute_outcome_end_to_end() -> None:
    start, end = date(2023, 9, 15), date(2024, 3, 15)
    stock = _series(start, 182, 100.0, 0.05)
    bench = _series(start, 182, 4000.0, 3.0)
    result = outcome.compute_outcome(stock, bench, start, end, dividends=[Dividend(date(2023, 12, 1), 1.0)])
    assert result["startDate"] == "2023-09-15" and result["endDate"] == "2024-03-15"
    assert result["pricePath"][0] == 100 and result["benchPath"][0] == 100
    assert result["pricePath"][-1] == round(100 + result["returnPct"], 1)
    assert result["relativePp"] == cardlib.relative_pp(result["returnPct"], result["benchReturnPct"])
    assert result["state"] == cardlib.result_state(result["relativePp"])


def test_compute_outcome_requires_judgment_day_close() -> None:
    stock = _series(date(2023, 9, 18), 180, 100.0, 0.1)
    with pytest.raises(outcome.OutcomeError, match="판단일"):
        outcome.compute_outcome(stock, stock, date(2023, 9, 16), date(2024, 3, 15))


def test_cli_reads_csv(tmp_path, capsys) -> None:
    start = date(2022, 1, 18)
    stock, bench = _series(start, 182, 100.0, -0.1), _series(start, 182, 4500.0, -4.0)
    files = {}
    for name, rows in (("stock", stock), ("bench", bench)):
        files[name] = tmp_path / f"{name}.csv"
        files[name].write_text("date,close\n" + "".join(f"{d},{c:.4f}\n" for d, c in rows), encoding="utf-8")
    splits = tmp_path / "splits.csv"
    splits.write_text("date,ratio\n2099-01-01,20\n", encoding="utf-8")
    code = outcome.main(["--stock", str(files["stock"]), "--bench", str(files["bench"]),
                         "--start", "2022-01-18", "--end", "2022-07-18", "--splits", str(splits)])
    captured = capsys.readouterr()
    assert code == 0
    result = json.loads(captured.out)
    assert set(result) == {"startDate", "endDate", "returnPct", "benchReturnPct", "relativePp", "state",
                           "pricePath", "benchPath"}
    assert "시장 대비" in captured.err


def test_repo_cards_are_internally_consistent() -> None:
    for path in cardlib.card_files(cardlib.CARDS_DIR):
        card = cardlib.load_json(path)
        o = card["reveal"]["outcome"]
        assert o["pricePath"][-1] == pytest.approx(100 + o["returnPct"], abs=0.05), path.name
        assert o["benchPath"][-1] == pytest.approx(100 + o["benchReturnPct"], abs=0.05), path.name
        assert outcome.state_of(o["returnPct"], o["benchReturnPct"]) == cardlib.card_state(card)
