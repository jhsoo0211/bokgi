"""mask.py: 판단 전 구획에서 누수 단어·절대 날짜를 지우고 보고한다. 결과 수치는 사람에게 넘긴다."""
from __future__ import annotations

from datetime import date

import cardlib
import check_case
import mask


def test_company_name_becomes_this_company_with_fixed_particles() -> None:
    text, changes, notes = mask.mask_text(
        "p", "마이크론은 감산했고 마이크론이 투자를 줄였어요. 크루셜 판매도 줄었어요.",
        company_terms=["마이크론", "MU"], other_terms=["크루셜"], judgment=None)
    assert text == "이 회사는 감산했고 이 회사가 투자를 줄였어요. [가림] 판매도 줄었어요."
    assert len(changes) == 3 and notes == []


def test_absolute_dates_become_relative_days() -> None:
    judgment = date(2022, 8, 18)
    text, changes, notes = mask.mask_text(
        "p", "2022-07-27 금리 인상, 8월 9일 공시, 12월 3일 보도, 2022년 6월 발표, 2022-09-01 예정",
        company_terms=[], other_terms=[], judgment=judgment)
    assert "판단일 D-22 금리 인상" in text
    assert "판단일 D-9 공시" in text
    assert "판단일 D-258 보도" in text                 # 연도 없는 날짜는 판단일 이전으로 본다
    assert "[날짜 가림] 발표" in text
    assert "[판단일 이후 — 지우기] 예정" in text
    assert len(notes) == 1 and "판단일 이후" in notes[0].reason


def test_masking_a_tampered_card_makes_it_pass(content_copy, edit_card) -> None:
    def tamper(card: dict) -> None:
        notes = card["public"]["panels"]["then"]["notes"]
        notes[0]["text"] = "2023-07-26에 기준금리가 올랐고 어도비는 Photoshop 가격을 올렸어요."
        card["public"]["evidenceOptions"][0]["label"] = "ADBE 매출 +23%"

    path = content_copy / "cards" / "c001.json"
    edit_card("c001", tamper)
    assert not check_case.run([path]).ok()
    assert mask.main([str(path), "--write"]) == 0                    # 사람이 고칠 것 없음
    masked = cardlib.load_json(path)
    assert masked["public"]["panels"]["then"]["notes"][0]["text"] == \
        "판단일 D-51에 기준금리가 올랐고 이 회사는 [가림] 가격을 올렸어요."
    assert masked["public"]["evidenceOptions"][0]["label"] == "이 회사 매출 +23%"
    assert check_case.run([path]).ok(), check_case.run([path]).render()


def test_outcome_numbers_are_left_for_a_human(content_copy, edit_card, capsys) -> None:
    path = content_copy / "cards" / "c001.json"
    edit_card("c001", lambda c: c["public"]["evidenceOptions"][0].__setitem__("label", "매출 +4.8%"))
    assert mask.main([str(path)]) == 1
    out = capsys.readouterr().out
    assert "사람이 고칠 것 (1건)" in out and "결과 수치" in out
    assert cardlib.load_json(path)["public"]["evidenceOptions"][0]["label"] == "매출 +4.8%"   # --write 없이는 그대로


def test_reveal_and_internal_are_untouched(content_copy) -> None:
    path = content_copy / "cards" / "c004.json"
    before = cardlib.load_json(path)
    assert mask.main([str(path), "--write"]) == 0
    after = cardlib.load_json(path)
    assert after == before                                          # 이미 깨끗한 카드는 바뀌지 않는다
