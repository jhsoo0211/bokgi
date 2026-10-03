"""flow_index.py: 판단일까지의 종가 → 14점 지수(첫 값 100), 시장 지수, 거래량 추이, CSV CLI."""
from __future__ import annotations

import json
from datetime import date, timedelta

import pytest

import cardlib
import flow_index
from schema_lite import Validator


def business_days(start: date, end: date) -> list[date]:
    days, d = [], start
    while d <= end:
        if d.weekday() < 5:
            days.append(d)
        d += timedelta(days=1)
    return days


def test_sample_positions_cover_both_ends() -> None:
    assert flow_index.sample_positions(14) == list(range(14))
    pos = flow_index.sample_positions(127)
    assert len(pos) == 14 and pos[0] == 0 and pos[-1] == 126
    assert all(a < b for a, b in zip(pos, pos[1:]))


def test_index_starts_at_100_and_keeps_ratios() -> None:
    closes = [50.0 + i for i in range(40)]
    market = [200.0 - i for i in range(40)]
    out = flow_index.flow_index(closes, market)
    pos = flow_index.sample_positions(40)
    assert out["index14"][0] == 100 and out["market14"][0] == 100
    assert len(out["index14"]) == len(out["market14"]) == 14
    assert out["index14"][-1] == round(100 * closes[-1] / closes[0], 1)
    assert out["market14"][5] == round(100 * market[pos[5]] / market[0], 1)


def test_anchor_judgment_puts_100_at_last_point() -> None:
    out = flow_index.flow_index([10.0, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25],
                                [5.0] * 14, anchor="judgment")
    assert out["index14"][-1] == 100 and out["index14"][0] == 40.0
    assert out["market14"] == [100.0] * 14


@pytest.mark.parametrize("closes,market,message", [
    ([1.0] * 13, [1.0] * 13, "14개 이상"),
    ([1.0] * 20, [1.0] * 19, "개수가 같아야"),
    ([1.0] * 19 + [0.0], [1.0] * 20, "0보다 큰"),
])
def test_bad_inputs_raise(closes, market, message) -> None:
    with pytest.raises(flow_index.FlowError, match=message):
        flow_index.flow_index(closes, market)


def test_volume_trend_words() -> None:
    assert flow_index.volume_trend([100] * 10 + [200] * 10) == "증가"
    assert flow_index.volume_trend([200] * 10 + [100] * 10) == "감소"
    assert flow_index.volume_trend([100, 110, 90] * 7) == "유지"


def test_window_never_includes_rows_after_judgment() -> None:
    judgment = date(2023, 9, 15)
    days = business_days(date(2023, 1, 2), date(2023, 12, 29))
    rows = {d: {"close": 100.0 + i, "volume": 1000.0} for i, d in enumerate(days)}
    picked = flow_index.window(rows, judgment, 180)
    assert picked[-1] == judgment and max(picked) <= judgment
    assert picked[0] > judgment - timedelta(days=180)
    panel, notes = flow_index.build_flow_panel(rows, rows, judgment, 180)
    assert any("판단일 이후" in n for n in notes)
    # 판단일 이후 값(더 큰 종가)이 섞였다면 끝값이 판단일 종가 비율보다 커진다
    first = rows[picked[0]]["close"]
    assert panel["index14"][-1] == round(100 * rows[judgment]["close"] / first, 1)


def test_missing_judgment_day_uses_last_session_with_note() -> None:
    judgment = date(2023, 9, 16)              # 토요일
    days = business_days(date(2023, 1, 2), date(2023, 9, 29))
    rows = {d: {"close": 50.0, "volume": None} for d in days}
    panel, notes = flow_index.build_flow_panel(rows, rows, judgment, 180)
    assert panel["volumeTrend"] == "유지"
    assert any("마지막 거래일(2023-09-15)" in n for n in notes)
    assert any("거래량" in n for n in notes)


def test_cli_reads_csv_and_output_fits_card_schema(tmp_path, capsys) -> None:
    judgment = date(2023, 9, 15)
    days = business_days(date(2023, 2, 1), date(2023, 11, 30))
    stock, market = tmp_path / "stock.csv", tmp_path / "market.csv"
    stock.write_text("date,close,volume\n" + "".join(
        f"{d},{100 + i * 0.5:.2f},{1000 + i * 20}\n" for i, d in enumerate(days)), encoding="utf-8")
    market.write_text("date,close\n" + "".join(
        f"{d},{4000 + i:.2f}\n" for i, d in enumerate(days)), encoding="utf-8")
    code = flow_index.main(["--stock", str(stock), "--market", str(market),
                            "--judgment-date", str(judgment), "--window-days", "180"])
    captured = capsys.readouterr()
    assert code == 0
    panel = json.loads(captured.out)
    assert panel["windowDays"] == 180 and panel["volumeTrend"] == "증가"
    assert panel["index14"][0] == 100 and panel["market14"][0] == 100
    assert "판단일 이후" in captured.err
    schema = cardlib.load_json(cardlib.SCHEMA_PATH)
    validator = Validator({"$ref": "#/$defs/flowPanel", "$defs": schema["$defs"]})
    assert validator.errors(panel) == []
