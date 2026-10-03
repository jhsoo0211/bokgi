#!/usr/bin/env python3
"""판단 전 구획(public) 초안에서 누수 단어와 절대 날짜를 지우고, 지운 것을 보고한다.

- 회사명·티커(와 그 변형) → '이 회사' (뒤따르는 조사도 맞춘다: 마이크론은 → 이 회사는)
- 그 밖의 누수 단어(제품명 등) → '[가림]'
- 날짜까지 있는 절대 날짜 → 판단일이 있으면 '판단일 D-n', 판단일 뒤 날짜면 '[판단일 이후 — 지우기]'(사람이 확인)
- 달·분기 수준의 시점 → '[날짜 가림]'·'[시점 가림]'
- 결과 수치·판단일 이후 상대 날짜는 고치지 않고 '사람이 고칠 것'으로 알린다.
규칙은 check_case.py와 같은 leakscan.py를 쓴다. reveal·internal은 건드리지 않는다.

사용:
  python3 tools/cards/mask.py content/drafts/c007.json            # 보고만
  python3 tools/cards/mask.py content/drafts/c007.json --write    # 제자리에 쓰기
  python3 tools/cards/mask.py public.json --term 제품명 --company-term 회사명 --judgment-date 2024-01-15 --out masked.json
종료 코드: 0 = 사람이 고칠 것 없음, 1 = 사람이 확인할 것이 남음
"""
from __future__ import annotations

import argparse
import copy
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardlib  # noqa: E402
import leakscan  # noqa: E402

COMPANY_PLACEHOLDER = "이 회사"
TERM_PLACEHOLDER = "[가림]"
JOSA_FIX = (("으로", "로"), ("은", "는"), ("을", "를"), ("과", "와"), ("이", "가"))


@dataclass(frozen=True)
class Change:
    path: str
    before: str
    after: str
    reason: str


@dataclass(frozen=True)
class Note:
    path: str
    match: str
    reason: str


def _is_hangul(ch: str) -> bool:
    return "가" <= ch <= "힣"


def fix_josa(rest: str) -> str:
    """받침 없는 '이 회사' 뒤에 붙은 받침용 조사를 바꾼다(뒤가 한글 음절이 아닐 때만)."""
    for src, dst in JOSA_FIX:
        if rest.startswith(src) and (len(rest) == len(src) or not _is_hangul(rest[len(src)])):
            return dst + rest[len(src):]
    return rest


def _date_from_match(label: str, text: str, judgment: date | None) -> date | None:
    nums = [int(n) for n in re.findall(r"\d+", text)]
    try:
        if label == "YYYY-MM-DD" and len(nums) == 3:
            return date(nums[0], nums[1], nums[2])
        if label == "YYYY년 M월" and len(nums) == 3:
            return date(nums[0], nums[1], nums[2])
        if label == "MM/DD/YYYY" and len(nums) == 3:
            year = nums[2] + 2000 if nums[2] < 100 else nums[2]
            return date(year, nums[0], nums[1])
        if label == "M월 D일" and len(nums) == 2 and judgment:
            guess = date(judgment.year, nums[0], nums[1])
            return guess if guess <= judgment else date(judgment.year - 1, nums[0], nums[1])
    except ValueError:
        return None
    return None


def mask_text(path: str, text: str, *, company_terms: list[str], other_terms: list[str],
              judgment: date | None) -> tuple[str, list[Change], list[Note]]:
    changes: list[Change] = []
    notes: list[Note] = []
    company = {t.strip() for t in company_terms if t.strip()}

    # 1) 누수 단어 — 뒤에서부터 바꿔 앞쪽 위치가 흔들리지 않게
    found = leakscan.find_terms(path, text, list(company) + list(other_terms))
    for f in sorted(found, key=lambda f: f.start, reverse=True):
        term = f.source or f.match
        replacement = COMPANY_PLACEHOLDER if term in company else TERM_PLACEHOLDER
        rest = text[f.end:]
        if replacement == COMPANY_PLACEHOLDER:
            rest = fix_josa(rest)
        changes.append(Change(path, f.match, replacement, f"누수 사전 '{term}'"))
        text = text[: f.start] + replacement + rest

    # 2) 절대 날짜
    for label, pattern in leakscan.ABS_DATE_PATTERNS:
        text = pattern.sub(lambda m, lb=label: _swap_date(lb, m.group(0), judgment, path, changes, notes), text)
    return text, changes, notes


def _swap_date(label: str, found: str, judgment: date | None, path: str,
               changes: list[Change], notes: list[Note]) -> str:
    when = _date_from_match(label, found, judgment)
    if when and judgment:
        if when <= judgment:
            after = f"판단일 D-{(judgment - when).days}"
            changes.append(Change(path, found, after, "절대 날짜 → 상대 날짜"))
            return after
        after = "[판단일 이후 — 지우기]"
        changes.append(Change(path, found, after, "판단일 이후 날짜"))
        notes.append(Note(path, found, "판단일 이후의 일은 판단 전 구획에 둘 수 없어요 — 문장을 지워 주세요"))
        return after
    after = "[시점 가림]" if label.startswith("연도+") else "[날짜 가림]"
    changes.append(Change(path, found, after, f"절대 날짜({label})"))
    return after


def mask_public(public: Any, *, company_terms: list[str], other_terms: list[str], judgment: date | None,
                numbers: dict[str, float]) -> tuple[Any, list[Change], list[Note], list[Note]]:
    """public 구획을 복사해 가린다. (가린 public, 바꾼 것, 사람이 고칠 것, 확인 권장)."""
    changes: list[Change] = []
    human: list[Note] = []
    advisory: list[Note] = []

    def walk(node: Any, path: str) -> Any:
        if isinstance(node, str):
            masked, ch, nt = mask_text(path, node, company_terms=company_terms, other_terms=other_terms,
                                       judgment=judgment)
            changes.extend(ch)
            human.extend(nt)
            for f in leakscan.scan_text(path, masked, terms=[], numbers=numbers):
                if f.kind in ("outcome_number", "future_day"):
                    human.append(Note(path, f.match, f"{leakscan.KIND_KO[f.kind]} — {f.detail}"))
                elif f.severity == "warning":
                    advisory.append(Note(path, f.match, f"{leakscan.KIND_KO[f.kind]} — {f.detail}"))
            return masked
        if isinstance(node, dict):
            return {k: walk(v, f"{path}.{k}") for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v, f"{path}[{i}]") for i, v in enumerate(node)]
        return node

    return walk(copy.deepcopy(public), "public"), changes, human, advisory


def company_terms_for(card: dict, extra: list[str]) -> tuple[list[str], list[str]]:
    """카드에서 (회사 단어, 그 밖의 누수 단어)를 나눈다. 회사명·티커와 회사명에 포함되거나 회사명을 포함하는 단어가 회사 단어."""
    out = cardlib.dig(card, "reveal", "outcome") or {}
    name, ticker = str(out.get("companyName") or ""), str(out.get("ticker") or "")
    terms = [t for t in cardlib.dig(card, "internal", "leakTerms") or [] if isinstance(t, str)]
    company = [t for t in (name, ticker, *extra) if t]
    for t in terms:
        low, nlow = t.casefold().replace(" ", ""), name.casefold().replace(" ", "")
        if nlow and (low in nlow or nlow in low) and t not in company:
            company.append(t)
    return company, [t for t in terms if t not in company]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="판단 전 구획(public)에서 누수 단어·절대 날짜를 지운다.")
    p.add_argument("file", help="카드 JSON(또는 public 구획만 담은 JSON)")
    p.add_argument("--term", action="append", default=[], help="더 가릴 단어(→ [가림]), 여러 번 가능")
    p.add_argument("--company-term", action="append", default=[], help="회사로 바꿀 단어(→ 이 회사)")
    p.add_argument("--judgment-date", help="판단일 YYYY-MM-DD (기본: reveal.outcome.startDate)")
    group = p.add_mutually_exclusive_group()
    group.add_argument("--write", action="store_true", help="제자리에 쓴다")
    group.add_argument("--out", help="다른 파일에 쓴다")
    a = p.parse_args(argv)

    data = cardlib.load_json(a.file)
    is_card = isinstance(data, dict) and isinstance(data.get("public"), dict)
    if is_card:
        company, others = company_terms_for(data, a.company_term)
        public = data["public"]
        out = cardlib.dig(data, "reveal", "outcome") or {}
        judgment = cardlib.parse_date(a.judgment_date) or cardlib.parse_date(out.get("startDate"))
        r, b = out.get("returnPct"), out.get("benchReturnPct")
        numbers = ({"returnPct": r, "benchReturnPct": b, "relativePp": cardlib.relative_pp(r, b)}
                   if isinstance(r, (int, float)) and isinstance(b, (int, float)) else {})
    else:
        company, others, public, numbers = list(a.company_term), [], data, {}
        judgment = cardlib.parse_date(a.judgment_date)
    others += a.term

    masked, changes, human, advisory = mask_public(public, company_terms=company, other_terms=others,
                                                   judgment=judgment, numbers=numbers)
    print(f"가린 것 ({len(changes)}건)")
    for c in changes:
        print(f"  {c.path}: '{c.before}' → '{c.after}' ({c.reason})")
    print(f"사람이 고칠 것 ({len(human)}건)")
    for n in human:
        print(f"  {n.path}: '{n.match}' — {n.reason}")
    if advisory:
        print(f"확인 권장 ({len(advisory)}건)")
        for n in advisory:
            print(f"  {n.path}: '{n.match}' — {n.reason}")
    if judgment is None:
        print("참고: 판단일을 몰라 날짜를 상대 날짜로 바꾸지 못했어요(--judgment-date)")

    result = dict(data, public=masked) if is_card else masked
    target = a.file if a.write else a.out
    if target:
        cardlib.write_json(target, result)
        print(f"→ {target}에 썼어요.")
    elif changes:
        print("→ 파일은 그대로예요. 쓰려면 --write 또는 --out")
    return 1 if human else 0


if __name__ == "__main__":
    raise SystemExit(main())
