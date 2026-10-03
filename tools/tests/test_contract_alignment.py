"""카드 스키마가 web/src/shared/contract.ts(유일한 API 계약)와 같은 필드·값 집합·개수 제한을 쓰는지 확인한다.

contract.ts의 zod 정의를 가볍게 읽는다(z.object 키, z.enum 값, z.literal, .min/.max/.length).
계약이 바뀌면 이 시험이 먼저 깨지고, content/schema/card.schema.json을 함께 고쳐야 한다.
"""
from __future__ import annotations

import re

import pytest

import cardlib

CONTRACT = cardlib.ROOT / "web" / "src" / "shared" / "contract.ts"
PAIRS = {"(": ")", "{": "}", "[": "]"}


def strip_comments(src: str) -> str:
    out, i, quote = [], 0, None
    while i < len(src):
        ch = src[i]
        if quote:
            out.append(ch)
            if ch == "\\":
                out.append(src[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
            out.append(ch)
        elif src.startswith("//", i):
            end = src.find("\n", i)
            i = len(src) if end < 0 else end
            continue
        elif src.startswith("/*", i):
            i = src.find("*/", i) + 2
            continue
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def matching(src: str, start: int) -> int:
    """src[start]의 여는 괄호와 짝인 닫는 괄호 위치."""
    stack, quote, i = [], None, start
    while i < len(src):
        ch = src[i]
        if quote:
            if ch == "\\":
                i += 1
            elif ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
        elif ch in PAIRS:
            stack.append(PAIRS[ch])
        elif ch in ")]}":
            assert stack.pop() == ch
            if not stack:
                return i
        i += 1
    raise ValueError("괄호 짝이 맞지 않아요")


def split_top(body: str) -> list[str]:
    parts, depth, quote, cur = [], 0, None, []
    for ch in body:
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
        elif ch in PAIRS:
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
            continue
        cur.append(ch)
    parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


@pytest.fixture(scope="module")
def consts() -> dict[str, str]:
    if not CONTRACT.exists():
        pytest.skip("web/src/shared/contract.ts가 없어요")
    src = strip_comments(CONTRACT.read_text(encoding="utf-8"))
    out = {}
    for m in re.finditer(r"export const (\w+)\s*=\s*", src):
        i, depth, quote = m.end(), 0, None
        while i < len(src) and not (src[i] == ";" and depth == 0 and quote is None):
            ch = src[i]
            if quote:
                quote = None if ch == quote else quote
            elif ch in "\"'`":
                quote = ch
            elif ch in PAIRS:
                depth += 1
            elif ch in ")]}":
                depth -= 1
            i += 1
        out[m.group(1)] = src[m.end():i].strip()
    return out


def resolve(consts: dict[str, str], expr: str) -> str:
    expr = expr.strip()
    return consts[expr] if re.fullmatch(r"\w+", expr) and expr in consts else expr


def fields(consts: dict[str, str], expr: str) -> dict[str, str]:
    """z.object({...})의 키 → 값 식. 식 안 어디에 있든 첫 z.object를 읽는다."""
    expr = resolve(consts, expr)
    start = expr.find("z.object(")
    assert start >= 0, expr
    open_brace = expr.index("{", start)
    body = expr[open_brace + 1: matching(expr, open_brace)]
    return {k.strip(): v.strip() for k, _, v in (p.partition(":") for p in split_top(body))}


def enum_values(consts: dict[str, str], expr: str) -> list[str]:
    return re.findall(r'"([^"]*)"', resolve(consts, expr).split("z.enum(", 1)[1].split(")", 1)[0])


def bound(expr: str, name: str) -> int | None:
    m = re.search(rf"\.{name}\((\d+)\)", expr)
    return int(m.group(1)) if m else None


@pytest.fixture(scope="module")
def defs() -> dict:
    return cardlib.load_json(cardlib.SCHEMA_PATH)["$defs"]


def props(defs: dict, name: str) -> dict:
    return defs[name]["properties"]


def test_public_matches_public_case_minus_id_version(consts, defs) -> None:
    public_case = fields(consts, "PublicCase")
    assert set(props(defs, "public")) == set(public_case) - {"id", "version"}
    assert set(props(defs, "public")["panels"]["properties"]) == set(fields(consts, public_case["panels"]))
    assert props(defs, "public")["sizeBucket"]["enum"] == enum_values(consts, public_case["sizeBucket"])
    literals = [int(x) for x in re.findall(r"z\.literal\((\d+)\)", public_case["horizonDays"])]
    assert props(defs, "public")["horizonDays"]["enum"] == literals
    assert props(defs, "public")["difficulty"]["minimum"] == bound(public_case["difficulty"], "min")
    assert props(defs, "public")["difficulty"]["maximum"] == bound(public_case["difficulty"], "max")
    for key in ("evidenceOptions", "riskOptions"):
        assert props(defs, "public")[key]["minItems"] == bound(public_case[key], "min")
        assert props(defs, "public")[key]["maxItems"] == bound(public_case[key], "max")


def test_panels_match(consts, defs) -> None:
    flow = fields(consts, "FlowPanel")
    assert set(props(defs, "flowPanel")) == set(flow)
    assert props(defs, "flowPanel")["volumeTrend"]["enum"] == enum_values(consts, flow["volumeTrend"])
    length = bound(consts["Index14"], "length")
    assert defs["index14"]["minItems"] == defs["index14"]["maxItems"] == length

    numbers = fields(consts, "NumbersPanel")
    assert set(props(defs, "numbersPanel")) == set(numbers)
    for group in ("growth", "valuation", "health"):
        assert set(props(defs, "numbersPanel")[group]["properties"]) == set(fields(consts, numbers[group])), group

    then = fields(consts, "ThenPanel")
    assert set(props(defs, "thenPanel")) == set(then)
    assert props(defs, "thenPanel")["rateTrend"]["enum"] == enum_values(consts, then["rateTrend"])
    note_schema = props(defs, "thenPanel")["notes"]
    assert set(note_schema["items"]["properties"]) == set(fields(consts, then["notes"]))
    assert note_schema["maxItems"] == bound(then["notes"], "max")
    source_kind = fields(consts, then["notes"])["sourceKind"]
    assert note_schema["items"]["properties"]["sourceKind"]["enum"] == enum_values(consts, source_kind)


def test_chips_match(consts, defs) -> None:
    evidence = fields(consts, "EvidenceOption")
    assert set(props(defs, "evidenceOption")) == set(evidence)
    assert props(defs, "evidenceOption")["panel"]["enum"] == enum_values(consts, evidence["panel"])
    assert set(props(defs, "riskOption")) == set(fields(consts, "RiskOption"))


def test_outcome_and_reveal_match(consts, defs) -> None:
    outcome = fields(consts, "Outcome")
    assert set(props(defs, "outcome")) == set(outcome)
    assert set(props(defs, "outcome")["sources"]["items"]["properties"]) == set(fields(consts, outcome["sources"]))
    reveal = fields(consts, "Reveal")
    assert props(defs, "reveal")["keyPoints"]["maxItems"] == bound(reveal["keyPoints"], "max")


def test_even_band_matches_contract(consts) -> None:
    src = CONTRACT.read_text(encoding="utf-8")
    # resultState()는 roundPp()로 소수 첫째 자리까지 반올림한 값 r을 ±EVEN_BAND_PP와 비교한다(2026-10-04 계약 변경 기록).
    m = re.search(r"Math\.abs\((?:relativePp|r)\)\s*<=\s*([\d.]+)", src)
    assert m and float(m.group(1)) == cardlib.EVEN_BAND_PP
    assert re.search(r"Math\.round\(relativePp \* 10\) / 10", src), "계약의 roundPp()가 소수 첫째 자리 반올림이어야 카드 도구와 같다"
