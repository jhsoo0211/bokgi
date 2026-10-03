"""check_case.py: 저장소 카드는 통과하고, 판단 전 구획에 회사명·절대 날짜·결과 수치 등을 넣은 사본은 실패한다."""
from __future__ import annotations

import re
import subprocess
import sys
from typing import Any, Callable

import pytest

import cardlib
import check_case

CHECK = cardlib.ROOT / "tools" / "cards" / "check_case.py"
TOKEN = re.compile(r"[^.\[\]]+|\[\d+\]")


def _walk(card: dict, path: str) -> tuple[Any, Any]:
    keys = [int(t[1:-1]) if t.startswith("[") else t for t in TOKEN.findall(path)]
    node = card
    for key in keys[:-1]:
        node = node[key]
    return node, keys[-1]


def set_path(path: str, value: Any) -> Callable[[dict], None]:
    def mutate(card: dict) -> None:
        node, key = _walk(card, path)
        node[key] = value
    return mutate


def append_text(path: str, text: str) -> Callable[[dict], None]:
    def mutate(card: dict) -> None:
        node, key = _walk(card, path)
        node[key] = f"{node[key]} {text}"
    return mutate


def both(*mutations: Callable[[dict], None]) -> Callable[[dict], None]:
    def mutate(card: dict) -> None:
        for m in mutations:
            m(card)
    return mutate


def error_categories(report: check_case.Report) -> set[str]:
    return {i.category for i in report.all_issues() if i.severity == "error"}


NOTE = "public.panels.then.notes[0].text"
LABEL = "public.evidenceOptions[0].label"
WHY = "public.evidenceOptions[1].why"

# (사례 이름, 카드, 고치기, 기대하는 오류 분류)
TAMPERS = [
    ("회사명(한글)", "c002", append_text(NOTE, "마이크론은 감산을 검토했어요."), "누수 단어"),
    ("회사명 띄어 쓴 변형", "c003", append_text(NOTE, "코카 콜라도 언급됐어요."), "누수 단어"),
    ("회사명(영문)", "c003", append_text(WHY, "Coca-Cola처럼요."), "누수 단어"),
    ("제품명", "c001", append_text(NOTE, "포토샵 구독자가 늘었어요."), "누수 단어"),
    ("티커", "c004", set_path(LABEL, "DAL 매출 −18%"), "티커"),
    ("한 글자 티커", "c006", append_text(NOTE, "M 주가가 올랐어요."), "티커"),
    ("절대 날짜 YYYY-MM-DD", "c005", append_text(NOTE, "2022-01-05 회의록 공개."), "절대 날짜"),
    ("절대 날짜 YYYY년 M월", "c006", append_text(NOTE, "2020년 12월 발표."), "절대 날짜"),
    ("절대 날짜 M월 D일", "c003", append_text(NOTE, "3월 10일 파산."), "절대 날짜"),
    ("영문 월 이름", "c002", append_text(NOTE, "August 보도."), "절대 날짜"),
    ("연도+분기", "c001", append_text(NOTE, "2023 Q3 실적."), "절대 날짜"),
    ("결과 수익률", "c001", set_path(LABEL, "매출 +4.8%"), "결과 수치"),
    ("음수 수익률(유니코드 마이너스)", "c002", append_text(WHY, "−12.4%까지 빠질 수 있어요."), "결과 수치"),
    ("시장 수익률", "c003", append_text(NOTE, "시장은 26.5% 올랐어요."), "결과 수치"),
    ("시장 대비 %p", "c004", append_text(WHY, "33.5%p 차이."), "결과 수치"),
    ("판단일 이후 상대 날짜", "c005", set_path("public.panels.then.notes[1].when", "판단일 D+10"), "스키마"),
    ("본문 속 판단일 이후 날짜", "c005", append_text(NOTE, "판단일 D+10에 발표 예정."), "판단일 이후 상대 날짜"),
    ("지수 첫 값 100 아님", "c001", set_path("public.panels.flow.index14[0]", 99), "지수 배열"),
    ("지수 13점", "c002", lambda c: c["public"]["panels"]["flow"]["market14"].pop(), "지수 배열"),
    ("결과 경로 끝값 불일치", "c004", set_path("reveal.outcome.pricePath[13]", 150), "지수 배열"),
    ("흐름 판 = 결과 경로", "c006",
     lambda c: c["public"]["panels"]["flow"].__setitem__("index14", list(c["reveal"]["outcome"]["pricePath"])), "누수"),
    ("판단 기간 120일", "c001", set_path("public.horizonDays", 120), "판단 기간"),
    ("날짜와 판단 기간 불일치", "c001", set_path("reveal.outcome.endDate", "2024-06-15"), "판단 기간"),
    ("기간 표기 불일치", "c003", set_path("reveal.outcome.period", "2022 Q1 → 2023 Q1"), "기간 표기"),
    ("공개 연도 불일치", "c005", set_path("public.yearPublic", 2021), "공개 연도"),
    ("자료 기준일 > 판단일", "c002", set_path("internal.dataCutoff", "2022-08-25"), "자료 기준일"),
    ("자료 기준일 뒤의 공시 날짜", "c001", set_path("internal.dataCutoff", "2023-09-01"), "공시일·자료 기준일"),
    ("근거 칩 id 중복", "c004", set_path("public.evidenceOptions[1].id", "ev1"), "칩 id"),
    ("위험 칩 id 중복", "c005", set_path("public.riskOptions[1].id", "rk1"), "칩 id"),
    ("없는 개념", "c006", set_path("reveal.learningPoints[0].conceptId", "no-such-concept"), "학습 포인트"),
    ("학습 포인트 rank 중복", "c001", set_path("reveal.learningPoints[1].rank", 1), "학습 포인트"),
    ("'가격' 출처 없음", "c002",
     lambda c: c["reveal"]["outcome"].__setitem__("sources", [s for s in c["reveal"]["outcome"]["sources"]
                                                             if s["kind"] != "가격"]), "출처"),
    ("배당·분할 표기 없음", "c003",
     lambda c: [s.__setitem__("label", "파생 지수 14점") for s in c["reveal"]["outcome"]["sources"] if s["kind"] == "가격"],
     "배당·분할"),
    ("예시 표기 없음(공개)", "c004",
     lambda c: c["reveal"]["outcome"].__setitem__("sources", [s for s in c["reveal"]["outcome"]["sources"]
                                                             if s["kind"] != "예시"]), "예시 표기"),
    ("예시 표기 없음(메모)", "c005", set_path("internal.notes", "제작 메모"), "예시 표기"),
    ("자리표시자", "c006", set_path(WHY, "TODO 나중에"), "자리표시자"),
    ("public에 모르는 키", "c001", set_path("public.companyName", "어도비"), "스키마"),
]


def test_repo_cards_pass_without_warnings() -> None:
    report = check_case.run([cardlib.CARDS_DIR])
    assert report.ok(strict=True), report.render()
    assert len(report.cards) == 6
    assert report.concept_count == 20 and report.quiz_count == 40


def test_cli_passes_on_repo_cards() -> None:
    proc = subprocess.run([sys.executable, str(CHECK), str(cardlib.CARDS_DIR)], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "결과: 통과" in proc.stdout


def test_cli_fails_on_tampered_copy_with_korean_report(content_copy, edit_card) -> None:
    edit_card("c001", append_text(NOTE, "어도비는 2023-09-03 발표에서 4.8% 상승을 예고했어요."))
    proc = subprocess.run([sys.executable, str(CHECK), str(content_copy / "cards")], capture_output=True, text=True)
    assert proc.returncode == 1
    out = proc.stdout
    assert "[실패] c001.json" in out and "결과: 실패" in out
    for words in ("[누수 단어]", "'어도비'", "[절대 날짜]", "'2023-09-03'", "[결과 수치]", "'4.8'", NOTE):
        assert words in out, words


@pytest.mark.parametrize("name,code,mutate,category", TAMPERS, ids=[t[0] for t in TAMPERS])
def test_tampered_copy_fails(content_copy, edit_card, name, code, mutate, category) -> None:
    edit_card(code, mutate)
    report = check_case.run([content_copy / "cards"])
    assert not report.ok(), f"{name}: 통과하면 안 돼요"
    assert category in error_categories(report), report.render()
    failed = [c.file.stem for c in report.cards if c.errors]
    assert failed == [code]


def test_company_names_outside_public_are_fine() -> None:
    """회사명은 reveal·internal에 있어야 하고, 검사는 public만 본다."""
    card = cardlib.load_json(cardlib.CARDS_DIR / "c001.json")
    assert card["reveal"]["outcome"]["companyName"] in card["internal"]["leakTerms"]
    assert check_case.run([cardlib.CARDS_DIR / "c001.json"]).cards[0].errors == []


def test_duplicate_deck_order_among_live_fails(content_copy, edit_card) -> None:
    order = cardlib.load_json(content_copy / "cards" / "c001.json")["deckOrder"]
    edit_card("c002", set_path("deckOrder", order))
    report = check_case.run([content_copy / "cards"])
    assert "deckOrder" in error_categories(report)


def test_duplicate_deck_order_with_draft_is_only_a_warning(content_copy, edit_card) -> None:
    order = cardlib.load_json(content_copy / "cards" / "c001.json")["deckOrder"]
    edit_card("c002", both(set_path("deckOrder", order), set_path("status", "draft")))
    report = check_case.run([content_copy / "cards"])
    assert report.ok(), report.render()
    assert any(i.category == "deckOrder" and i.severity == "warning" for i in report.deck)


def test_three_behind_in_a_row_fails(content_copy, edit_card) -> None:
    # c001·c002·c003은 모두 '뒤짐' — 1·2·3번에 몰면 3연속
    orders = {"c001": 1, "c002": 2, "c003": 3, "c004": 4, "c005": 5, "c006": 6}
    for code, n in orders.items():
        edit_card(code, set_path("deckOrder", n))
    report = check_case.run([content_copy / "cards"])
    assert "결과 균형" in error_categories(report)
    assert "세 장 연속 '뒤짐'이에요" in report.render()


def test_duplicate_card_id_fails(content_copy, edit_card) -> None:
    other = cardlib.load_json(content_copy / "cards" / "c001.json")["id"]
    edit_card("c002", set_path("id", other))
    assert "카드 id" in error_categories(check_case.run([content_copy / "cards"]))


def test_concept_body_must_have_three_sentences(content_copy) -> None:
    path = content_copy / "concepts.json"
    data = cardlib.load_json(path)
    data["concepts"][0]["body"] = "한 문장뿐입니다."
    cardlib.write_json(path, data)
    report = check_case.run([content_copy / "cards"])
    assert not report.ok()
    assert any("세 문장" in i.message for i in report.concepts)


def test_empty_directory_fails(tmp_path) -> None:
    (tmp_path / "cards").mkdir()
    assert check_case.main([str(tmp_path / "cards")]) == 1


def test_strict_mode_turns_warnings_into_failure(content_copy, edit_card) -> None:
    edit_card("c001", append_text(NOTE, "2008년 이후 처음이었어요."))   # 연도만 → 경고
    report = check_case.run([content_copy / "cards"])
    assert report.ok() and not report.ok(strict=True)
