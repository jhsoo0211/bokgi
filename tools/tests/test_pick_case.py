"""pick_case.py: live 카드의 deckOrder를 같은 상태 3연속 없이, 결정적으로 정한다."""
from __future__ import annotations

import random
from collections import Counter

import pytest

import cardlib
import check_case
import pick_case


def repo_cards() -> list[tuple]:
    return [(f, cardlib.load_json(f)) for f in cardlib.card_files(cardlib.CARDS_DIR)]


def test_repo_deck_already_matches_plan() -> None:
    """content/cards의 deckOrder는 pick_case가 정한 그대로다(다시 돌려도 바뀌지 않는다)."""
    for f, card, order in pick_case.plan(repo_cards()):
        assert card["deckOrder"] == order, f.name


def test_plan_is_deterministic_and_respects_rule() -> None:
    first = [(f.name, n) for f, _, n in pick_case.plan(repo_cards())]
    again = [(f.name, n) for f, _, n in pick_case.plan(list(reversed(repo_cards())))]
    assert first == again
    rows = sorted(pick_case.plan(repo_cards()), key=lambda r: r[2])
    assert cardlib.triple_runs([cardlib.card_state(c) for _, c, _ in rows]) == []


def test_random_feasible_decks_never_have_three_in_a_row() -> None:
    rng = random.Random(20261003)
    tried = 0
    while tried < 300:
        states = [rng.choice(cardlib.STATES) for _ in range(rng.randint(1, 30))]
        if not pick_case.feasible(Counter(states)):
            continue
        tried += 1
        keys = [f"id-{i}" for i in range(len(states))]
        order = pick_case.order_states(keys, states)
        assert sorted(order) == list(range(len(states)))
        assert cardlib.triple_runs([states[i] for i in order]) == []
        assert order == pick_case.order_states(keys, states)


def test_feasibility_boundary() -> None:
    assert pick_case.feasible(Counter({"behind": 4, "ahead": 1}))        # 뒤뒤앞뒤뒤
    assert not pick_case.feasible(Counter({"behind": 5, "ahead": 1}))
    with pytest.raises(pick_case.DeckError, match="뒤짐"):
        pick_case.order_states([str(i) for i in range(6)], ["behind"] * 5 + ["ahead"])


def test_non_live_cards_follow_live_cards() -> None:
    cards = repo_cards()
    draft = dict(cards[0][1], status="draft", id="00000000-0000-4000-8000-000000000000", deckOrder=1)
    rows = pick_case.plan(cards + [(cards[0][0].with_name("c099.json"), draft)])
    assert rows[-1][1]["status"] == "draft" and rows[-1][2] == len(cards) + 1


def test_cli_write_fixes_a_broken_deck(content_copy, edit_card) -> None:
    for code, n in {"c001": 1, "c002": 2, "c003": 3, "c004": 4, "c005": 5, "c006": 6}.items():
        edit_card(code, lambda c, n=n: c.__setitem__("deckOrder", n))
    cards_dir = content_copy / "cards"
    assert not check_case.run([cards_dir]).ok()
    assert pick_case.main([str(cards_dir)]) == 0                      # 계획만: 파일은 그대로
    assert not check_case.run([cards_dir]).ok()
    assert pick_case.main([str(cards_dir), "--write"]) == 0
    assert check_case.run([cards_dir]).ok()
