"""content/concepts.json: 개념 트리 v1(기획안 §7) 20개, 네 갈래, 세 문장 설명, 확인 문제 2개씩."""
from __future__ import annotations

import re
from collections import Counter

import cardlib
from schema_lite import Validator

PROTOTYPE_IDS = {"abs-vs-relative", "growth-vs-valuation", "debt-and-cycle", "base-rate"}
KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def concepts() -> list[dict]:
    return cardlib.load_json(cardlib.CONCEPTS_PATH)["concepts"]


def test_schema_valid() -> None:
    data = cardlib.load_json(cardlib.CONCEPTS_PATH)
    assert Validator(cardlib.load_json(cardlib.CONCEPTS_SCHEMA_PATH)).errors(data) == []
    assert [b["id"] for b in data["branches"]] == ["outcome", "numbers", "then", "self"]


def test_twenty_concepts_five_per_branch_with_prototype_ids() -> None:
    items = concepts()
    assert len(items) == 20
    assert Counter(c["branch"] for c in items) == {"outcome": 5, "numbers": 5, "then": 5, "self": 5}
    ids = [c["id"] for c in items]
    assert len(set(ids)) == 20 and all(KEBAB.match(i) for i in ids)
    assert PROTOTYPE_IDS <= set(ids)
    branch = {c["id"]: c["branch"] for c in items}
    assert branch["abs-vs-relative"] == branch["base-rate"] == "outcome"
    assert branch["growth-vs-valuation"] == branch["debt-and-cycle"] == "numbers"


def test_body_is_exactly_three_korean_sentences() -> None:
    for c in concepts():
        assert cardlib.count_sentences(c["body"]) == 3, c["id"]
        assert re.search(r"[가-힣]", c["body"]), c["id"]


def test_two_quizzes_each_with_valid_answers() -> None:
    quiz_ids = []
    for c in concepts():
        assert len(c["quizzes"]) == 2, c["id"]
        for q in c["quizzes"]:
            quiz_ids.append(q["quizId"])
            assert q["quizId"].startswith(c["id"] + "-q")
            assert 2 <= len(q["options"]) <= 4 and len(set(q["options"])) == len(q["options"])
            assert 0 <= q["answerIndex"] < len(q["options"])
            assert q["question"].strip() and q["explanation"].strip()
    assert len(quiz_ids) == len(set(quiz_ids)) == 40
    answers = Counter(q["answerIndex"] for c in concepts() for q in c["quizzes"])
    assert len(answers) >= 3                                          # 정답 위치가 한쪽으로 쏠리지 않게


def test_card_learning_points_use_existing_concepts() -> None:
    ids = {c["id"] for c in concepts()}
    used = {lp["conceptId"] for f in cardlib.card_files(cardlib.CARDS_DIR)
            for lp in cardlib.load_json(f)["reveal"]["learningPoints"]}
    assert used <= ids
