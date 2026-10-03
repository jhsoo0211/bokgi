#!/usr/bin/env python3
"""덱 순서(deckOrder) 정하기: live 카드의 결과 상태(앞섬·뒤짐·비슷함)가 3장 연속 같지 않게.

런타임(오늘 세트)은 결과를 읽으면 안 되므로 결과 균형은 여기서 덱 순서로 굳힌다(ADR-0001 §5).
규칙 자체가 단서가 되지 않게 엄격한 번갈아 놓기는 하지 않는다: 카드 id의 해시로 섞은 순서를
기본으로 두고, 3연속이 생기거나 남은 카드로 규칙을 지킬 수 없게 되는 경우만 건너뛴다. 같은 입력이면
같은 순서가 나온다(결정적). live가 아닌 카드는 live 뒤에 기존 순서대로 번호를 이어 받는다.

사용:
  python3 tools/cards/pick_case.py content/cards            # 계획만 보여 준다
  python3 tools/cards/pick_case.py content/cards --write    # deckOrder를 파일에 쓴다
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from collections import Counter
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardlib  # noqa: E402

DEFAULT_SEED = "bokgi-deck-v1"


class DeckError(ValueError):
    pass


@lru_cache(maxsize=None)
def _feasible(ahead: int, behind: int, even: int, last: str, run: int) -> bool:
    """남은 개수로 3연속 없이 끝까지 놓을 수 있는가(직전 상태 last가 run번 이어진 상태에서)."""
    remaining = {"ahead": ahead, "behind": behind, "even": even}
    if not any(remaining.values()):
        return True
    for state, count in remaining.items():
        if count == 0 or (state == last and run >= 2):
            continue
        nxt = dict(remaining)
        nxt[state] -= 1
        if _feasible(nxt["ahead"], nxt["behind"], nxt["even"], state, run + 1 if state == last else 1):
            return True
    return False


def feasible(counts: Counter, last: str = "", run: int = 0) -> bool:
    return _feasible(counts.get("ahead", 0), counts.get("behind", 0), counts.get("even", 0), last, run)


def order_states(keys: list[str], states: list[str], seed: str = DEFAULT_SEED) -> list[int]:
    """keys(카드 id)와 states로 순서(위치 목록)를 만든다. 규칙을 지킬 수 없으면 DeckError."""
    counts = Counter(states)
    if not feasible(counts):
        top, n = counts.most_common(1)[0]
        raise DeckError(f"'{cardlib.STATE_KO[top]}' {n}장이 너무 많아 3연속 없이 놓을 수 없어요 "
                        f"(다른 상태 합 {len(states) - n}장 → 최대 {2 * (len(states) - n + 1)}장)")
    def shuffle_key(i: int) -> tuple[str, str]:
        return hashlib.sha256(f"{seed}|{keys[i]}".encode()).hexdigest(), keys[i]

    pending = sorted(range(len(keys)), key=shuffle_key)
    chosen: list[int] = []
    last, run = "", 0
    while pending:
        for i in pending:
            state = states[i]
            if state == last and run >= 2:
                continue
            new_run = run + 1 if state == last else 1
            left = counts.copy()
            left[state] -= 1
            if feasible(left, state, new_run):
                chosen.append(i)
                pending.remove(i)
                counts, last, run = left, state, new_run
                break
        else:  # pragma: no cover — feasible()이 먼저 막는다
            raise DeckError("순서를 만들 수 없어요")
    return chosen


def plan(cards: list[tuple[Path, dict]], seed: str = DEFAULT_SEED) -> list[tuple[Path, dict, int]]:
    """(파일, 카드, 새 deckOrder) 목록. live 카드가 1번부터, 나머지는 그 뒤로."""
    live = [(f, c) for f, c in cards if c.get("status") == "live"]
    rest = [(f, c) for f, c in cards if c.get("status") != "live"]
    states = [cardlib.card_state(c) for _, c in live]
    order = order_states([c["id"] for _, c in live], states, seed)
    result = [(live[i][0], live[i][1], n) for n, i in enumerate(order, start=1)]
    rest.sort(key=lambda fc: (fc[1].get("deckOrder") if isinstance(fc[1].get("deckOrder"), int) else 10**9, fc[0].name))
    result += [(f, c, n) for n, (f, c) in enumerate(rest, start=len(result) + 1)]
    return result


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="결과 균형(같은 상태 3연속 금지)에 맞춰 deckOrder를 정한다.")
    p.add_argument("directory", help="카드 폴더 (예: content/cards)")
    p.add_argument("--seed", default=DEFAULT_SEED, help=f"섞는 순서의 씨앗 (기본 {DEFAULT_SEED})")
    p.add_argument("--write", action="store_true", help="바뀐 deckOrder를 파일에 쓴다")
    a = p.parse_args(argv)
    cards = [(f, cardlib.load_json(f)) for f in cardlib.card_files(a.directory)]
    if not cards:
        print("카드 파일이 없어요.", file=sys.stderr)
        return 1
    try:
        rows = plan(cards, a.seed)
    except (DeckError, KeyError, TypeError) as e:
        print(f"순서를 정하지 못했어요: {e}", file=sys.stderr)
        return 1
    changed = 0
    print(f"덱 순서 계획 (seed={a.seed})")
    for f, c, order in rows:
        old = c.get("deckOrder")
        state = cardlib.STATE_KO[cardlib.card_state(c)] if c.get("status") == "live" else "-"
        mark = "" if old == order else f"  (지금 {old})"
        changed += old != order
        pub = c.get("public", {})
        meta = f"{pub.get('yearPublic')} {pub.get('sectorPublic')}"
        print(f"  {order:>3}  {f.name:<12} {c.get('status'):<8} {meta} · {state}{mark}")
    counts = Counter(cardlib.card_state(c) for _, c, _ in rows if c.get("status") == "live")
    print("  live 결과: " + " · ".join(f"{cardlib.STATE_KO[s]} {counts.get(s, 0)}" for s in cardlib.STATES))
    missing = [cardlib.STATE_KO[s] for s in cardlib.STATES if not counts.get(s)]
    if missing:
        print(f"  참고: live 카드에 {', '.join(missing)} 결과가 없어요 — 결과를 고르게 섞어 주세요(기획안 §12)")
    if a.write:
        for f, c, order in rows:
            if c.get("deckOrder") != order:
                c["deckOrder"] = order
                cardlib.write_json(f, c)
        print(f"→ {changed}개 파일의 deckOrder를 바꿨어요.")
    else:
        print(f"→ 바뀔 파일 {changed}개. 쓰려면 --write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
